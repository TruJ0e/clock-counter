package com.trujoedigital.trutimeclock

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import kotlin.math.abs

/**
 * Foreground, user-requested floating timer above other Android applications.
 * It does not require a remote API and is only started from a visible Activity.
 */
class ClockOverlayService : Service() {
    companion object {
        const val ACTION_STOP = "com.trujoedigital.trutimeclock.STOP_OVERLAY"
        const val CHANNEL = "trutimeclock_floating"
        const val NOTIFICATION_ID = 101

        @Volatile var running = false
            private set
        @Volatile var selected: ClockSnapshot? = null

        fun updateClock(snapshot: ClockSnapshot) {
            selected = snapshot
        }
    }

    private lateinit var windows: WindowManager
    private var window: LinearLayout? = null
    private var params: WindowManager.LayoutParams? = null
    private var label: TextView? = null
    private var name: TextView? = null
    private val handler=Handler(Looper.getMainLooper())
    private var compact=false
    private var notifiedFor = 0L

    override fun onBind(intent: Intent?) = null

    override fun onCreate() {
        super.onCreate()
        windows=getSystemService(WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if(intent?.action==ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if(!Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        if(!running) {
            createOverlay()
            createForegroundNotification()
            running=true
            handler.post(tick)
        }
        return START_NOT_STICKY
    }

    private fun dp(value: Int): Int =
        (resources.displayMetrics.density*value).toInt()

    private fun createOverlay() {
        val column=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setPadding(dp(8),dp(5),dp(8),dp(7))
            setBackgroundColor(Color.rgb(8,8,8))
            elevation=dp(9).toFloat()
        }
        val header=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            gravity=Gravity.CENTER_VERTICAL
        }
        name=TextView(this).apply {
            text="TRUTIMECLOCK"
            textSize=10f
            setTextColor(Color.WHITE)
            setTypeface(android.graphics.Typeface.MONOSPACE,android.graphics.Typeface.BOLD)
            maxLines=1
            ellipsize=android.text.TextUtils.TruncateAt.END
        }
        val dragHint=TextView(this).apply {
            text="⇄"
            textSize=16f
            setTextColor(Color.LTGRAY)
            gravity=Gravity.CENTER
        }
        val collapse=TextView(this).apply {
            text="−"
            textSize=20f
            setTextColor(Color.GREEN)
            gravity=Gravity.CENTER
            setOnClickListener {
                compact=!compact
                text=if(compact) "▣" else "−"
                name?.visibility=if(compact) View.GONE else View.VISIBLE
                params?.width=dp(if(compact) 88 else 188)
                params?.height=dp(if(compact) 82 else 105)
                params?.let { p -> windows.updateViewLayout(column,p) }
            }
        }
        val close=TextView(this).apply {
            text="×"
            textSize=20f
            setTextColor(Color.WHITE)
            gravity=Gravity.CENTER
            setOnClickListener { stopSelf() }
        }
        header.addView(dragHint,LinearLayout.LayoutParams(dp(30),dp(30)))
        header.addView(name,LinearLayout.LayoutParams(0,dp(30),1f))
        header.addView(collapse,LinearLayout.LayoutParams(dp(28),dp(30)))
        header.addView(close,LinearLayout.LayoutParams(dp(25),dp(30)))
        label=TextView(this).apply {
            text="30:00"
            textSize=29f
            setTypeface(android.graphics.Typeface.MONOSPACE,android.graphics.Typeface.BOLD)
            setTextColor(Color.RED)
            gravity=Gravity.CENTER
            includeFontPadding=false
        }
        column.addView(header,LinearLayout.LayoutParams(-1,dp(32)))
        column.addView(label,LinearLayout.LayoutParams(-1,dp(55)))
        // Drag the timer to an edge. Closing it is a separate explicit action.
        dragHint.setOnTouchListener(object:View.OnTouchListener{
            var downX=0f;var downY=0f;var startX=0;var startY=0
            override fun onTouch(view: View,event:android.view.MotionEvent):Boolean {
                val p=params?:return false
                when(event.actionMasked){
                    android.view.MotionEvent.ACTION_DOWN -> {
                        downX=event.rawX;downY=event.rawY
                        startX=p.x;startY=p.y
                        return true
                    }
                    android.view.MotionEvent.ACTION_MOVE -> {
                        p.x=(startX-(event.rawX-downX).toInt()).coerceAtLeast(0)
                        p.y=(startY+(event.rawY-downY).toInt()).coerceAtLeast(0)
                        windows.updateViewLayout(column,p)
                        return true
                    }
                    android.view.MotionEvent.ACTION_UP -> return true
                }
                return false
            }
        })
        params=WindowManager.LayoutParams(
            dp(188),dp(105),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply{
            gravity=Gravity.TOP or Gravity.END
            x=dp(12)
            y=dp(160)
        }
        windows.addView(column,params)
        window=column
    }

    private fun createForegroundNotification() {
        val mgr=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        mgr.createNotificationChannel(NotificationChannel(
            CHANNEL,"Floating TruTimeClock",NotificationManager.IMPORTANCE_LOW
        ).apply { description="Keeps your requested floating clock running" })
        val openIntent=PendingIntent.getActivity(this,0,
            Intent(this,MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stopIntent=PendingIntent.getService(this,1,
            Intent(this,ClockOverlayService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification=Notification.Builder(this,CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("TruTimeClock floating timer")
            .setContentText("Tap to open. Use Stop to remove the overlay.")
            .setContentIntent(openIntent)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.graphics.drawable.Icon.createWithResource(this,android.R.drawable.ic_menu_close_clear_cancel),
                "Stop",stopIntent).build())
            .build()
        if(Build.VERSION.SDK_INT>=34)
            startForeground(NOTIFICATION_ID,notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION_ID,notification)
    }

    private val tick=object:Runnable{
        override fun run() {
            val now=System.currentTimeMillis()
            val snapshot=selected
            if(snapshot!=null) {
                name?.text=if(compact) "" else snapshot.title.uppercase()
                label?.text=snapshot.labelAt(now)
                label?.setTextColor(snapshot.color)
                // A completion is visible even when the WebView is backgrounded.
                val deadline = snapshot.deadlineMs ?: snapshot.scheduledStartMs?.let {
                    it + snapshot.durationMs
                }
                val eligible = snapshot.mode != "stopwatch" &&
                    (snapshot.running || snapshot.scheduledStartMs != null)
                if(eligible && deadline != null &&
                    now >= deadline && notifiedFor != deadline) {
                    notifiedFor=deadline
                    showFinishedNotification(snapshot.title)
                }
            }
            if(running)handler.postDelayed(this,250)
        }
    }

    private fun showFinishedNotification(title: String) {
        val manager=getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val channel="trutimeclock_finished"
        manager.createNotificationChannel(NotificationChannel(
            channel,"Completed timers",NotificationManager.IMPORTANCE_HIGH
        ))
        manager.notify(102, Notification.Builder(this,channel)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText("Time is up")
            .setAutoCancel(true)
            .build())
    }

    override fun onDestroy() {
        running=false
        handler.removeCallbacks(tick)
        window?.let { runCatching{windows.removeView(it)} }
        window=null
        super.onDestroy()
    }
}

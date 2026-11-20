package com.trujoedigital.trutimeclock

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.*
import android.webkit.*
import android.widget.*
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    companion object {
        private const val APP_ORIGIN="https://appassets.androidplatform.net"
        private const val APP_URL="$APP_ORIGIN/www/index.html"
    }
    private fun dp(n:Int)=(resources.displayMetrics.density*n).toInt()
    private lateinit var web:WebView
    private lateinit var status:TextView

    private inner class ClockBridge {
        @JavascriptInterface
        fun updateClock(json:String) {
            val snapshot=ClockSnapshot.fromJson(json)?:return
            ClockOverlayService.updateClock(snapshot)
            runOnUiThread {
                status.text=if(snapshot.scheduledStartMs!=null) "Scheduled: "+snapshot.title
                    else if(snapshot.running) "Running: "+snapshot.title else snapshot.title
            }
        }
    }

    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor=Color.BLACK
        window.navigationBarColor=Color.BLACK
        val root=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(8,8,8))
        }
        val top=LinearLayout(this).apply {
            orientation=LinearLayout.HORIZONTAL
            gravity=Gravity.CENTER_VERTICAL
            setPadding(12,4,12,4)
        }
        status=TextView(this).apply{
            text="TRUTIMECLOCK"
            setTextColor(Color.WHITE)
            textSize=12f
            setTypeface(android.graphics.Typeface.MONOSPACE,android.graphics.Typeface.BOLD)
            maxLines=1
        }
        val float=Button(this).apply {
            text="FLOAT"
            setTextColor(Color.WHITE)
            setOnClickListener { requestFloatingClock() }
        }
        val stop=Button(this).apply {
            text="STOP FLOAT"
            setTextColor(Color.WHITE)
            setOnClickListener { stopFloatingClock() }
        }
        top.addView(status,LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1f))
        top.addView(float,LinearLayout.LayoutParams(dp(70),LinearLayout.LayoutParams.WRAP_CONTENT))
        top.addView(stop,LinearLayout.LayoutParams(dp(110),LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(top,LinearLayout.LayoutParams(-1,-2))

        val assets=WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/www/",WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web=WebView(this).apply {
            settings.javaScriptEnabled=true
            settings.domStorageEnabled=true
            settings.allowFileAccess=false
            settings.allowContentAccess=false
            settings.loadsImagesAutomatically=true
            settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.cacheMode=WebSettings.LOAD_DEFAULT
            addJavascriptInterface(ClockBridge(),"ClockBridge")
            webViewClient=object:WebViewClient() {
                override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest) =
                    assets.shouldInterceptRequest(request.url)
                override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean {
                    val uri=request.url
                    if(uri.scheme=="https"&&uri.host=="appassets.androidplatform.net"&&
                        uri.path?.startsWith("/www/")==true)return false
                    if(uri.scheme=="https") {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW,uri)) }
                    }
                    return true
                }
            }
            webChromeClient=WebChromeClient()
            loadUrl(APP_URL)
        }
        root.addView(web,LinearLayout.LayoutParams(-1,0,1f))
        setContentView(root)
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            !=PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),15)
    }

    private fun requestFloatingClock() {
        if(!Settings.canDrawOverlays(this)) {
            Toast.makeText(this,"Allow Display over other apps, then return to TruTimeClock",Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")))
            return
        }
        if(ClockOverlayService.running) {
            Toast.makeText(this,"Floating clock is already running",Toast.LENGTH_SHORT).show()
            return
        }
        val i=Intent(this,ClockOverlayService::class.java)
        if(Build.VERSION.SDK_INT>=26)startForegroundService(i)
        else startService(i)
    }

    private fun stopFloatingClock() {
        stopService(Intent(this,ClockOverlayService::class.java))
    }

    override fun onDestroy() {
        web.removeJavascriptInterface("ClockBridge")
        web.destroy()
        super.onDestroy()
    }
}

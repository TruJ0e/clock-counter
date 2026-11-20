package com.trujoedigital.trutimeclock

import org.json.JSONObject

/** One selected TruTimeClock timer; immutable absolute-time snapshot. */
data class ClockSnapshot(
    val id: String,
    val title: String,
    val color: Int,
    val running: Boolean,
    val scheduledStartMs: Long?,
    val deadlineMs: Long?,
    val startedAtMs: Long?,
    val durationMs: Long,
    val remainingMs: Long,
    val elapsedMs: Long,
    val mode: String
) {
    companion object {
        fun fromJson(raw: String): ClockSnapshot? { return try {
            if (raw.length > 4096) return null
            val json = JSONObject(raw)
            val hex = json.optString("color", "#F20B14")
            val color = if (Regex("^#[0-9A-Fa-f]{6}$").matches(hex))
                android.graphics.Color.parseColor(hex)
            else android.graphics.Color.RED
            val duration = json.optLong("durationMs", 0L).coerceIn(0, 359999000L)
            fun millis(key: String): Long? {
                val v = json.optLong(key, 0)
                return if (v in 1..4102444800000L) v else null
            }
            ClockSnapshot(
                id = json.optString("id", "clock").take(40),
                title = json.optString("name", "TruTimeClock").take(36),
                color = color,
                running = json.optBoolean("running", false),
                scheduledStartMs = millis("scheduledStartMs"),
                deadlineMs = millis("deadlineMs"),
                startedAtMs = millis("startedAtMs"),
                durationMs = duration,
                remainingMs = json.optLong("remainingMs", duration).coerceIn(0, 359999000L),
                elapsedMs = json.optLong("elapsedMs", 0L).coerceIn(0, 359999000L),
                mode = json.optString("mode", "countdown").take(20)
            )
        } catch (_: Exception) { null } }
    }

    fun remainingAt(now: Long): Long = when {
        scheduledStartMs != null && now < scheduledStartMs -> remainingMs
        scheduledStartMs != null && !running ->
            (scheduledStartMs + durationMs - now).coerceAtLeast(0)
        running && deadlineMs != null -> (deadlineMs - now).coerceAtLeast(0)
        else -> remainingMs
    }

    fun labelAt(now: Long): String {
        if (scheduledStartMs != null && now < scheduledStartMs) {
            val seconds = ((scheduledStartMs - now).coerceAtLeast(0) + 999) / 1000
            return "START IN " + formatted(seconds)
        }
        if(mode == "stopwatch" && running) {
            val elapsed = if (startedAtMs != null)
                (now - startedAtMs).coerceAtLeast(0) else elapsedMs
            return formatted(elapsed / 1000)
        }
        return formatted((remainingAt(now) + 999) / 1000)
    }

    private fun formatted(totalSeconds: Long): String {
        val seconds = totalSeconds.coerceIn(0, 359999)
        val hours = seconds / 3600
        val minutes = (seconds % 3600) / 60
        val remainder = seconds % 60
        return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, remainder)
        else "%02d:%02d".format(minutes, remainder)
    }
}

package moe.sable.client

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class CallForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var audioFocusRequest: AudioFocusRequest? = null

  override fun onBind(intent: android.content.Intent?): IBinder? = null

  override fun onStartCommand(intent: android.content.Intent?, flags: Int, startId: Int): Int {
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Microphone permission is not granted; stopping foreground service")
      stopSelf(startId)
      return START_NOT_STICKY
    }

    try {
      createNotificationChannel()
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        NotificationCompat.Builder(this, CHANNEL_ID)
          .setSmallIcon(R.mipmap.ic_notification)
          .setContentTitle("Call in progress")
          .setContentText("Sable is using your microphone")
          .setCategory(NotificationCompat.CATEGORY_CALL)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .build(),
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
          0
        }
      )
    } catch (error: Exception) {
      Log.e(TAG, "Failed to start microphone foreground service", error)
      stopSelf(startId)
      return START_NOT_STICKY
    }

    acquireWakeLock()
    requestAudioFocus()

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    releaseAudioFocus()
    releaseWakeLock()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sable:CallForeground")
    wakeLock?.acquire(WAKE_LOCK_TIMEOUT_MS)
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun requestAudioFocus() {
    val am = getSystemService(AUDIO_SERVICE) as AudioManager
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      .setAudioAttributes(attributes)
      .setOnAudioFocusChangeListener { _ -> }
      .build()
    am.requestAudioFocus(audioFocusRequest!!)
  }

  private fun releaseAudioFocus() {
    audioFocusRequest?.let {
      val am = getSystemService(AUDIO_SERVICE) as AudioManager
      am.abandonAudioFocusRequest(it)
    }
    audioFocusRequest = null
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Calls",
      NotificationManager.IMPORTANCE_LOW
    )
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private companion object {
    const val CHANNEL_ID = "call_foreground"
    const val NOTIFICATION_ID = 1395
    const val TAG = "CallForegroundService"
    const val WAKE_LOCK_TIMEOUT_MS = 60L * 60L * 1000L
  }
}

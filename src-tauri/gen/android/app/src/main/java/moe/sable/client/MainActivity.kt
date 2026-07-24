package moe.sable.client

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.IntentCompat
import androidx.core.view.WindowCompat
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private external fun nativeInitStatusBar()

  // Route the hardware back button through the web app (see onWebViewCreate).
  override val handleBackNavigation: Boolean = false
  private var webView: WebView? = null
  private var handlingBack = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    instance = this
    runCatching { nativeInitStatusBar() }
    stageShareIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    stageShareIntent(intent)
  }

  private fun stageShareIntent(intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    require(intent != null)

    val batchDir = File(File(dataDir, "share_inbox"), "${System.currentTimeMillis()}-${UUID.randomUUID()}")
    batchDir.mkdirs()
    val items = JSONArray()

    when (action) {
      Intent.ACTION_SEND -> {
        when (intent.type) {
          "text/plain" -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let { addTextItem(items, it) }
          else -> {
            IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
              ?.let { stageFile(it, 0, batchDir, items) }
            intent.getStringExtra(Intent.EXTRA_TEXT)?.let { addTextItem(items, it) }
          }
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
          ?.forEachIndexed { i, uri -> stageFile(uri, i, batchDir, items) }
      }
    }

    if (items.length() == 0) {
      batchDir.deleteRecursively()
      return
    }
    File(batchDir, "share.json").writeText(
      JSONObject().apply {
        put("version", 1)
        put("items", items)
      }.toString()
    )
  }

  private fun addTextItem(items: JSONArray, text: String) {
    items.put(JSONObject().apply {
      put("kind", if (text.startsWith("http://") || text.startsWith("https://")) "url" else "text")
      put("text", text)
    })
  }

  private fun stageFile(uri: Uri, index: Int, batchDir: File, items: JSONArray) {
    val resolver = contentResolver
    var displayName = "shared-$index"
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (i >= 0) displayName = c.getString(i)
      }
    }
    val sanitized = displayName
      .replace("/", "_").replace("\\", "_").replace("\u0000", "")
      .take(120)
      .let { if (it.isEmpty() || it == "." || it == "..") "shared" else it }

    val fileName = "$index-$sanitized"
    val dest = File(batchDir, fileName)
    val input = resolver.openInputStream(uri)
    if (input == null) {
      android.util.Log.w("ShareTarget", "provider returned no stream for $uri")
      return
    }
    try {
      input.use { FileOutputStream(dest).use { output -> it.copyTo(output) } }
      items.put(JSONObject().apply {
        put("kind", "file")
        put("fileName", fileName)
        put("mime", resolver.getType(uri) ?: "application/octet-stream")
      })
    } catch (e: Exception) {
      android.util.Log.w("ShareTarget", "stage failed: ${e.message}")
      dest.delete()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (handlingBack) return
          val wv = this@MainActivity.webView
          if (wv == null) {
            moveTaskToBack(true)
            return
          }
          handlingBack = true
          // If the web app didn't consume the back press, background the app.
          wv.evaluateJavascript(
            "(typeof window.__sableAndroidBack === 'function' && window.__sableAndroidBack() === true)"
          ) { result ->
            handlingBack = false
            if (result != "true") moveTaskToBack(true)
          }
        }
      }
    )
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    super.onDestroy()
  }

  companion object {
    private var instance: MainActivity? = null

    // Bars stay transparent (edge-to-edge plugin) so the webview strips supply the color
    // on every version; these only adapt icon contrast. setStatusBarColor/setNavigationBarColor
    // are no-ops under enforced edge-to-edge on Android 15+, so we avoid them.
    @JvmStatic
    fun setStatusBarColorNative(color: Int) {
      val activity = instance ?: return
      activity.runOnUiThread {
        val window = activity.window
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars =
          isLight(color)
      }
    }

    @JvmStatic
    fun setNavigationBarColorNative(color: Int) {
      val activity = instance ?: return
      activity.runOnUiThread {
        val window = activity.window
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars =
          isLight(color)
      }
    }

    private fun isLight(color: Int): Boolean {
      val luminance =
        (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0
      return luminance > 0.5
    }
  }
}

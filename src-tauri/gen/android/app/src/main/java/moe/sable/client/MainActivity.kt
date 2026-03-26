package moe.sable.client

import android.graphics.Bitmap
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var lastTop = 0f
  private var lastBottom = 0f
  private var lastLeft = 0f
  private var lastRight = 0f
  private var webViewRef: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView

    val originalClient = webView.webViewClient

    webView.webViewClient = object : WebViewClient() {
      override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        originalClient.onPageStarted(view, url, favicon)
        injectCssInsets(view)
      }

      override fun onPageFinished(view: WebView, url: String) {
        originalClient.onPageFinished(view, url)
        injectCssInsets(view)
      }

      override fun onPageCommitVisible(view: WebView, url: String) {
        super.onPageCommitVisible(view, url)
        injectCssInsets(view)
      }

      override fun shouldOverrideUrlLoading(
        view: WebView,
        request: android.webkit.WebResourceRequest
      ): Boolean = originalClient.shouldOverrideUrlLoading(view, request)

      override fun shouldInterceptRequest(
        view: WebView,
        request: android.webkit.WebResourceRequest
      ): android.webkit.WebResourceResponse? = originalClient.shouldInterceptRequest(view, request)

      override fun onReceivedError(
        view: WebView,
        request: android.webkit.WebResourceRequest,
        error: android.webkit.WebResourceError
      ) = originalClient.onReceivedError(view, request, error)
    }

    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val density = view.resources.displayMetrics.density

      lastTop = bars.top / density
      lastBottom = maxOf(bars.bottom, ime.bottom) / density
      lastLeft = bars.left / density
      lastRight = bars.right / density

      // Don't use setPadding — it gets clobbered by Wry/Tauri internals.
      // Instead, rely solely on CSS custom properties for inset handling.
      injectCssInsets(view as WebView)

      WindowInsetsCompat.CONSUMED
    }

    // Wry may reset layout after onWebViewCreate — re-request insets.
    webView.post { webView.requestApplyInsets() }
    // Also re-request after a short delay to handle Wry's deferred setup.
    webView.postDelayed({ webView.requestApplyInsets() }, 500)
  }

  private fun injectCssInsets(webView: WebView) {
    webView.evaluateJavascript(
      """
      (function() {
        var s = document.documentElement.style;
        s.setProperty('--sable-inset-top', '${lastTop}px');
        s.setProperty('--sable-inset-bottom', '${lastBottom}px');
        s.setProperty('--sable-inset-left', '${lastLeft}px');
        s.setProperty('--sable-inset-right', '${lastRight}px');
      })();
      """.trimIndent(),
      null
    )
  }
}

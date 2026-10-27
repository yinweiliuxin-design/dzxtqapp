package com.smartvio.studio.test;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Public-web client shell. No admin, credentials, advertising SDK or native instrument bridge. */
public final class MainActivity extends Activity {
    private static final String START = NativePolicy.ORIGIN + "/?v=20261025-v27-workspaces-1";
    private static final int PERMISSIONS = 71, OPEN_FILE = 72, SAVE_FILE = 73;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService copier = Executors.newSingleThreadExecutor();
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private PermissionRequest pendingPermission;
    private int permissionEpoch, epoch;
    private ValueCallback<Uri[]> fileCallback;
    private int fileEpoch;
    private WebMessagePort channel;
    private String nonce;
    private NativePolicy.Export exporting;
    private NativePolicy.Export saveRequest;
    private boolean waitingSave, copying, destroyed, pageFailed, chooserMultiple, permissionDialogOpen, fileChooserOpen, rendererGone;
    private final Runnable exportTimeout = () -> failExport("导出等待超时，请重试。");

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        createUi();
        configureWeb();
        // Do not restore untrusted URLs or transient native export/permission state.
        String last = state == null ? null : state.getString("trustedUrl");
        web.loadUrl(NativePolicy.isTrusted(last) ? last : START);
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + .5f); }
    private void createUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(250, 248, 241));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(14), 0, dp(4), 0);
        TextView title = new TextView(this);
        title.setText("Silvio  ·  手机测试版"); title.setTextSize(12); title.setTextColor(Color.rgb(85, 88, 82));
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(42), 1));
        title.setGravity(Gravity.CENTER_VERTICAL);
        Button menu = new Button(this);
        menu.setText("•••"); menu.setTextSize(18); menu.setContentDescription("应用菜单");
        menu.setMinWidth(0); menu.setMinimumWidth(0); menu.setPadding(0, 0, 0, 0);
        menu.setBackgroundColor(Color.TRANSPARENT);
        menu.setOnClickListener(this::showMenu);
        toolbar.addView(menu, new LinearLayout.LayoutParams(dp(48), dp(42)));
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(2)));
        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(250, 248, 241));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER); errorPanel.setPadding(dp(28), dp(24), dp(28), dp(24));
        errorPanel.setBackgroundColor(Color.rgb(250, 248, 241));
        TextView message = new TextView(this);
        message.setText("页面暂时无法打开\n\n首次使用需要连接网络。若尚未准备离线内容，请联网后重试。也可以在系统浏览器检查访问情况。");
        message.setTextSize(17); message.setGravity(Gravity.CENTER); message.setTextColor(Color.DKGRAY);
        errorPanel.addView(message, new LinearLayout.LayoutParams(-1, -2));
        Button retry = new Button(this); retry.setText("重新加载"); retry.setOnClickListener(v -> reload()); errorPanel.addView(retry);
        Button browser = new Button(this); browser.setText("在浏览器打开"); browser.setOnClickListener(v -> openExternal(START)); errorPanel.addView(browser);
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
    }

    private void configureWeb() {
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); // SAF-selected content URIs only; never navigated as pages.
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSafeBrowsingEnabled(true); s.setMediaPlaybackRequiresUserGesture(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false); s.setSupportMultipleWindows(false);
        s.setUseWideViewPort(true); s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true); s.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return navigate(request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return navigate(url); }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                epoch++; clearPageCapabilities(); pageFailed = false; errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
                if (!NativePolicy.isTrusted(url)) { view.stopLoading(); showError(); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!pageFailed && NativePolicy.isTrusted(url) && NativePolicy.isTrusted(view.getUrl())) installExportBridge();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler ssl, SslError error) { ssl.cancel(); showError(); }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                rendererGone = true;
                clearPageCapabilities(); showError();
                new AlertDialog.Builder(MainActivity.this).setTitle("页面需要重新启动").setMessage("系统释放了网页进程。重新启动不会清除已保存的设置。")
                    .setPositiveButton("重新启动", (d, w) -> recreate()).setNegativeButton("关闭", (d, w) -> finish()).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public void onPermissionRequest(PermissionRequest request) { handlePermission(request); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingPermission == request) pendingPermission = null;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted() || fileChooserOpen) { callback.onReceiveValue(null); return true; }
                cancelFileChooser(); fileCallback = callback; fileEpoch = epoch;
                chooserMultiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, chooserMultiple);
                String[] types = params.getAcceptTypes();
                ArrayList<String> mimeTypes = new ArrayList<>();
                if (types != null) for (String type : types) if (type != null && type.matches("[a-zA-Z0-9.+_-]+/[a-zA-Z0-9.+_*-]+")) mimeTypes.add(type);
                if (!mimeTypes.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
                try { fileChooserOpen = true; startActivityForResult(intent, OPEN_FILE); }
                catch (ActivityNotFoundException e) { fileChooserOpen = false; cancelFileChooser(); toast("系统文件选择器不可用。"); }
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (NativePolicy.isTrusted(url) || NativePolicy.isExternalHttps(url)) openExternal(url);
            else toast("请使用页面中的下载或导出按钮保存文件。");
        });
    }

    private boolean trusted() { return !destroyed && !rendererGone && web != null && NativePolicy.isTrusted(web.getUrl()) && !pageFailed; }
    private String currentUrl() { return !rendererGone && web != null && NativePolicy.isTrusted(web.getUrl()) ? web.getUrl() : START; }
    private boolean navigate(String url) {
        if (NativePolicy.isTrusted(url)) return false;
        if (NativePolicy.isExternalHttps(url)) openExternal(url);
        else toast("此链接类型无法在测试版内打开。");
        return true;
    }
    private void openExternal(String url) {
        if (!(NativePolicy.isTrusted(url) || NativePolicy.isExternalHttps(url))) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException e) { toast("未找到可用浏览器。"); }
    }
    private void reload() { if (rendererGone) { recreate(); return; } errorPanel.setVisibility(View.GONE); web.loadUrl(currentUrl()); }
    private void showError() { pageFailed = true; clearPageCapabilities(); progress.setVisibility(View.GONE); errorPanel.setVisibility(View.VISIBLE); }
    private void toast(String message) { if (!destroyed) Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "在浏览器打开"); menu.getMenu().add(0, 2, 1, "重新加载");
        menu.getMenu().add(0, 3, 2, "应用权限"); menu.getMenu().add(0, 4, 3, "关于测试版");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1: openExternal(currentUrl()); break;
                case 2: reload(); break;
                case 3: startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); break;
                case 4: new AlertDialog.Builder(this).setTitle("Silvio 0.27.1 · iQOO 11 测试版")
                    .setMessage("保留访客模式与现有网页功能。麦克风、相机仅在使用对应功能时申请授权。文件导入及保存使用系统文件选择器。\n\n首次加载需要网络；离线内容请先在本 App 内准备。录音与设置仅存于本 App 的网页存储，卸载会移除。重要录音请及时导出。\n\n本版用于真机验收，尚未验证该手机上的蓝牙、MIDI 与音画同步。本包未加入原生 MIDI / BLE 桥，网页设备功能取决于 WebView 和硬件能力；需要时可在浏览器打开。请保持前台录制，无后台录音服务。单个导出文件上限 100 MB。\n\nGoogle / Apple 登录仍取决于服务端正式配置。浏览器登录状态与 App 不共享，访客功能不受影响。")
                    .setPositiveButton("知道了", null).show(); break;
            }
            return true;
        }); menu.show();
    }

    private void handlePermission(PermissionRequest request) {
        if (!trusted() || !NativePolicy.isTrusted(request.getOrigin().toString()) || pendingPermission != null || permissionDialogOpen) { request.deny(); return; }
        ArrayList<String> permissions = new ArrayList<>();
        boolean known = false;
        for (String resource : request.getResources()) {
            String needed = null;
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needed = Manifest.permission.RECORD_AUDIO;
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needed = Manifest.permission.CAMERA;
            if (needed != null) { known = true; if (checkSelfPermission(needed) != PackageManager.PERMISSION_GRANTED && !permissions.contains(needed)) permissions.add(needed); }
        }
        if (!known) { request.deny(); return; }
        pendingPermission = request; permissionEpoch = epoch;
        if (permissions.isEmpty()) finishPermission();
        else { permissionDialogOpen = true; requestPermissions(permissions.toArray(new String[0]), PERMISSIONS); }
    }
    private void finishPermission() {
        PermissionRequest request = pendingPermission; pendingPermission = null;
        if (request == null) return;
        if (!trusted() || epoch != permissionEpoch || !NativePolicy.isTrusted(request.getOrigin().toString())) { request.deny(); return; }
        ArrayList<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) granted.add(resource);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) granted.add(resource);
        }
        if (granted.isEmpty()) request.deny(); else request.grant(granted.toArray(new String[0]));
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) { super.onRequestPermissionsResult(code, permissions, grants); if (code == PERMISSIONS) { permissionDialogOpen = false; finishPermission(); } }
    private void cancelFileChooser() { ValueCallback<Uri[]> old = fileCallback; fileCallback = null; if (old != null) old.onReceiveValue(null); }
    private boolean safePickedUri(Uri uri) {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme()) || uri.getAuthority() == null) return false;
        String authority = uri.getAuthority();
        if (authority.equals(getPackageName()) || authority.startsWith(getPackageName() + ".")) return false;
        // The system grants the temporary capability. Ensure it is actually readable before forwarding it.
        if (checkUriPermission(uri, android.os.Process.myPid(), android.os.Process.myUid(), Intent.FLAG_GRANT_READ_URI_PERMISSION) != PackageManager.PERMISSION_GRANTED) return false;
        try (android.content.res.AssetFileDescriptor ignored = getContentResolver().openAssetFileDescriptor(uri, "r")) { return ignored != null; }
        catch (Exception e) { return false; }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == OPEN_FILE) {
            fileChooserOpen = false;
            ValueCallback<Uri[]> callback = fileCallback; fileCallback = null;
            if (callback == null) return;
            ArrayList<Uri> selected = new ArrayList<>();
            if (result == RESULT_OK && data != null && trusted() && fileEpoch == epoch) {
                ClipData clips = data.getClipData();
                if (clips != null) for (int i = 0; i < clips.getItemCount() && selected.size() < (chooserMultiple ? 20 : 1); i++) {
                    Uri uri = clips.getItemAt(i).getUri(); if (safePickedUri(uri)) selected.add(uri);
                }
                else if (safePickedUri(data.getData())) selected.add(data.getData());
            }
            callback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
        } else if (code == SAVE_FILE) {
            waitingSave = false;
            final NativePolicy.Export job = saveRequest; saveRequest = null;
            if (job == null || job != exporting || !trusted()) { if (job != null) job.close(); return; }
            Uri uri = data == null ? null : data.getData();
            if (result != RESULT_OK || uri == null) { respond(job.id, "cancelled", null); cleanupExport(); return; }
            if (!"content".equalsIgnoreCase(uri.getScheme()) || !job.complete() || checkUriPermission(uri, android.os.Process.myPid(), android.os.Process.myUid(), Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != PackageManager.PERMISSION_GRANTED) { failExport("保存位置无效，请重试。"); return; }
            copying = true;
            copier.execute(() -> {
                Exception failure = null;
                try (InputStream input = new FileInputStream(job.file); OutputStream output = getContentResolver().openOutputStream(uri, "w")) {
                    if (output == null) throw new java.io.IOException("No destination");
                    byte[] buffer = new byte[64 * 1024]; int size; long written = 0;
                    while ((size = input.read(buffer)) != -1) { output.write(buffer, 0, size); written += size; }
                    output.flush(); if (written != job.total) throw new java.io.IOException("Incomplete copy");
                } catch (Exception e) { failure = e; }
                final boolean success = failure == null;
                handler.post(() -> {
                    copying = false;
                    if (exporting == job) {
                        respond(job.id, success ? "saved" : "error", success ? null : "保存失败，请检查可用空间后重试。");
                        cleanupExport();
                    } else job.close();
                    if (!destroyed) toast(success ? "文件已保存。" : "保存失败，请重试。");
                });
            });
        }
    }

    private void installExportBridge() {
        if (!trusted() || channel != null) return;
        try (InputStream source = getAssets().open("bridge.js"); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count; while ((count = source.read(buffer)) != -1) bytes.write(buffer, 0, count);
            nonce = UUID.randomUUID().toString();
            final String token = nonce; final int currentEpoch = epoch;
            String script = new String(bytes.toByteArray(), StandardCharsets.UTF_8).replace("__SILVIO_NONCE__", JSONObject.quote(token));
            web.evaluateJavascript(script, ignored -> {
                if (!trusted() || epoch != currentEpoch || !token.equals(nonce)) return;
                WebMessagePort[] ports = web.createWebMessageChannel(); channel = ports[0];
                channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                    @Override public void onMessage(WebMessagePort port, WebMessage message) {
                        if (port != channel || !trusted() || epoch != currentEpoch || !token.equals(nonce)) return;
                        receive(message.getData());
                    }
                }, handler);
                try {
                    JSONObject hello = new JSONObject().put("type", "silvio-export-channel").put("nonce", token);
                    web.postWebMessage(new WebMessage(hello.toString(), new WebMessagePort[]{ports[1]}), Uri.parse(NativePolicy.ORIGIN));
                } catch (Exception e) { ports[1].close(); closeChannel(); }
            });
        } catch (Exception e) { toast("文件保存通道未启动，可重新加载后重试。"); }
    }
    private void receive(String text) {
        String id = "";
        try {
            if (text == null || text.length() > 68000) throw new IllegalArgumentException("Oversize packet");
            JSONObject message = new JSONObject(text);
            if (!nonce.equals(message.optString("nonce"))) return;
            id = message.getString("id"); if (!NativePolicy.id(id)) throw new IllegalArgumentException("Invalid id");
            String type = message.getString("type");
            if ("begin".equals(type)) {
                if (exporting != null || copying || saveRequest != null) { respond(id, "error", "上一份文件尚未保存完成，请先完成或取消。"); return; }
                Object totalValue = message.get("total");
                if (!(totalValue instanceof Integer || totalValue instanceof Long)) throw new IllegalArgumentException("Invalid total");
                exporting = new NativePolicy.Export(new File(getCacheDir(), "exports"), id, message.optString("name"), message.optString("mime"), message.getLong("total"));
                armTimeout(); respond(id, "ready", null);
            } else if ("chunk".equals(type)) {
                if (exporting == null || waitingSave || copying) throw new IllegalArgumentException("No transfer");
                Object offsetValue = message.get("offset");
                if (!(offsetValue instanceof Integer || offsetValue instanceof Long)) throw new IllegalArgumentException("Invalid offset");
                String data = message.getString("data");
                if (data.length() > ((NativePolicy.CHUNK_BYTES + 2) / 3) * 4 || !data.matches("[A-Za-z0-9+/]*={0,2}")) throw new IllegalArgumentException("Invalid data");
                long offset = exporting.append(id, message.getLong("offset"), Base64.decode(data, Base64.NO_WRAP));
                armTimeout(); respondOffset(id, offset);
            } else if ("end".equals(type)) {
                if (exporting == null || waitingSave || copying) throw new IllegalArgumentException("No transfer");
                exporting.finish(id); handler.removeCallbacks(exportTimeout); respond(id, "complete", null);
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(exporting.mime).putExtra(Intent.EXTRA_TITLE, exporting.name);
                save.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION); waitingSave = true; saveRequest = exporting;
                try { startActivityForResult(save, SAVE_FILE); }
                catch (ActivityNotFoundException e) { waitingSave = false; saveRequest = null; failExport("系统文件保存器不可用，请重试。"); }
            } else if ("abort".equals(type)) {
                if (exporting != null && exporting.id.equals(id) && !waitingSave && !copying) cleanupExport();
            } else throw new IllegalArgumentException("Unknown message");
        } catch (Exception e) {
            if (exporting != null && exporting.id.equals(id) && !copying && !waitingSave) failExport("文件导出校验失败，请重新导出。");
            else respond(id, "error", "无法处理此导出请求，请重试。");
        }
    }
    private void armTimeout() { handler.removeCallbacks(exportTimeout); handler.postDelayed(exportTimeout, 90000); }
    private void respondOffset(String id, long offset) {
        try { send(new JSONObject().put("id", id).put("status", "chunk").put("offset", offset)); } catch (Exception ignored) { }
    }
    private void respond(String id, String status, String message) {
        try { JSONObject value = new JSONObject().put("id", id).put("status", status); if (message != null) value.put("message", message); send(value); } catch (Exception ignored) { }
    }
    private void send(JSONObject value) {
        if (channel == null || nonce == null || !trusted()) return;
        try { value.put("nonce", nonce); channel.postMessage(new WebMessage(value.toString())); } catch (Exception ignored) { }
    }
    private void failExport(String reason) { if (exporting != null) respond(exporting.id, "error", reason); cleanupExport(); }
    private void cleanupExport() {
        handler.removeCallbacks(exportTimeout);
        NativePolicy.Export old = exporting; exporting = null; waitingSave = false;
        if (old != null && !copying) old.close();
    }
    private void closeChannel() { if (channel != null) { try { channel.close(); } catch (Exception ignored) { } } channel = null; nonce = null; }
    private void clearPageCapabilities() {
        if (pendingPermission != null) { pendingPermission.deny(); pendingPermission = null; }
        cancelFileChooser(); cleanupExport(); closeChannel();
    }
    @Override public void onBackPressed() {
        if (rendererGone) { recreate(); return; }
        if (web != null && web.canGoBack()) web.goBack();
        else new AlertDialog.Builder(this).setTitle("退出 Silvio？").setMessage("正在录制时，请先停止并保存。").setNegativeButton("继续使用", null).setPositiveButton("退出", (d, w) -> finish()).show();
    }
    @Override protected void onSaveInstanceState(Bundle state) { state.putString("trustedUrl", currentUrl()); super.onSaveInstanceState(state); }
    @Override protected void onResume() { super.onResume(); if (web != null && !rendererGone) web.onResume(); }
    @Override protected void onPause() {
        if (web != null && !rendererGone) {
            // Use the existing application's stop/save flow, retaining asynchronous
            // MediaRecorder final chunks and IndexedDB saves. Never pause JS timers.
            // Permission and document picker overlays are not an instruction to cancel a capture request.
            if (trusted() && !permissionDialogOpen && !fileChooserOpen && !waitingSave) web.evaluateJavascript("['[data-action=\"stop-record\"]','[data-perf-action=\"record-stop\"]','[data-perf-action=\"pause\"]','[data-action=\"stop-tuner\"]','[data-action=\"stop-metro\"]','[data-action=\"stop-loops\"]','[data-action=\"stop\"]'].forEach(function(selector){var e=document.querySelector(selector);if(e&&!e.disabled)e.click();});document.querySelectorAll('audio,video').forEach(function(e){e.pause();});if(window.SVAudioEngine){window.SVAudioEngine.stop();window.SVAudioEngine.stopTuner();}", null);
            web.onPause();
        }
        super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true; clearPageCapabilities(); copier.shutdown();
        if (web != null) { if (!rendererGone) web.stopLoading(); ((ViewGroup) web.getParent()).removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}

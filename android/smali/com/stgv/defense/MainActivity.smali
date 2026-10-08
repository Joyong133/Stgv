.class public Lcom/stgv/defense/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

.field private web:Landroid/webkit/WebView;

.method public constructor <init>()V
    .locals 0
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method private hideBars()V
    .locals 2
    invoke-virtual {p0}, Lcom/stgv/defense/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v0
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V
    return-void
.end method

.method private callJs(Ljava/lang/String;)V
    .locals 2
    iget-object v0, p0, Lcom/stgv/defense/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    const/4 v1, 0x0
    invoke-virtual {v0, p1, v1}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    :done
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .locals 4
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-virtual {p0}, Lcom/stgv/defense/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x80
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/stgv/defense/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    const/4 v3, 0x0
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V

    const/high16 v2, -0x1000000
    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setVerticalScrollBarEnabled(Z)V
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setHorizontalScrollBarEnabled(Z)V

    new-instance v2, Lcom/stgv/defense/Bridge;
    invoke-direct {v2, p0}, Lcom/stgv/defense/Bridge;-><init>(Lcom/stgv/defense/MainActivity;)V
    const-string v3, "AndroidBridge"
    invoke-virtual {v0, v2, v3}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    invoke-virtual {p0, v0}, Lcom/stgv/defense/MainActivity;->setContentView(Landroid/view/View;)V
    invoke-direct {p0}, Lcom/stgv/defense/MainActivity;->hideBars()V

    const-string v1, "file:///android_asset/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .locals 0
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :skip
    invoke-direct {p0}, Lcom/stgv/defense/MainActivity;->hideBars()V
    :skip
    return-void
.end method

.method public onBackPressed()V
    .locals 1
    const-string v0, "window.onAndroidBack&&window.onAndroidBack()"
    invoke-direct {p0, v0}, Lcom/stgv/defense/MainActivity;->callJs(Ljava/lang/String;)V
    return-void
.end method

.method protected onPause()V
    .locals 1
    const-string v0, "window.onAndroidPause&&window.onAndroidPause()"
    invoke-direct {p0, v0}, Lcom/stgv/defense/MainActivity;->callJs(Ljava/lang/String;)V
    iget-object v0, p0, Lcom/stgv/defense/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :nw
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :nw
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method protected onResume()V
    .locals 1
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, Lcom/stgv/defense/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :nw
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :nw
    invoke-direct {p0}, Lcom/stgv/defense/MainActivity;->hideBars()V
    return-void
.end method

.method protected onDestroy()V
    .locals 1
    iget-object v0, p0, Lcom/stgv/defense/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :nw
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    :nw
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method

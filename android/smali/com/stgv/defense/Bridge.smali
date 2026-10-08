.class public Lcom/stgv/defense/Bridge;
.super Ljava/lang/Object;
.source "Bridge.java"

.field private final act:Lcom/stgv/defense/MainActivity;
.field private final prefs:Landroid/content/SharedPreferences;

.method public constructor <init>(Lcom/stgv/defense/MainActivity;)V
    .locals 2
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/stgv/defense/Bridge;->act:Lcom/stgv/defense/MainActivity;
    const-string v0, "save"
    const/4 v1, 0x0
    invoke-virtual {p1, v0, v1}, Lcom/stgv/defense/MainActivity;->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;
    move-result-object v0
    iput-object v0, p0, Lcom/stgv/defense/Bridge;->prefs:Landroid/content/SharedPreferences;
    return-void
.end method

.method public save(Ljava/lang/String;Ljava/lang/String;)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lcom/stgv/defense/Bridge;->prefs:Landroid/content/SharedPreferences;
    invoke-interface {v0}, Landroid/content/SharedPreferences;->edit()Landroid/content/SharedPreferences$Editor;
    move-result-object v0
    invoke-interface {v0, p1, p2}, Landroid/content/SharedPreferences$Editor;->putString(Ljava/lang/String;Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;
    move-result-object v0
    invoke-interface {v0}, Landroid/content/SharedPreferences$Editor;->commit()Z
    return-void
.end method

.method public load(Ljava/lang/String;)Ljava/lang/String;
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lcom/stgv/defense/Bridge;->prefs:Landroid/content/SharedPreferences;
    const-string v1, ""
    invoke-interface {v0, p1, v1}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object v0
    return-object v0
.end method

.method public exit()V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation
    iget-object v0, p0, Lcom/stgv/defense/Bridge;->act:Lcom/stgv/defense/MainActivity;
    invoke-virtual {v0}, Lcom/stgv/defense/MainActivity;->finish()V
    return-void
.end method

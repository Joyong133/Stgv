import com.android.apksig.ApkSigner;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/** APK 서명 (v2). 사용법: java -cp apksig.jar Sign.java <keystore> <pass> <alias> <in.apk> <out.apk> */
public class Sign {
    public static void main(String[] a) throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[0])) {
            ks.load(in, a[1].toCharArray());
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[2], a[1].toCharArray());
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[2]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder(a[2], key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc))
                .setInputApk(new File(a[3]))
                .setOutputApk(new File(a[4]))
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false) // minSdk 24 이상은 v2 서명만으로 충분
                .setV2SigningEnabled(true)
                .build()
                .sign();
        System.out.println("signed: " + a[4]);
    }
}

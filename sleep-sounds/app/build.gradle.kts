plugins {
    id("com.android.application")
}

android {
    namespace = "com.joyong133.danjam"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.joyong133.danjam"
        minSdk = 24
        targetSdk = 35
        versionCode = providers.gradleProperty("danjam.versionCode").get().toInt()
        versionName = providers.gradleProperty("danjam.versionName").get()
    }

    signingConfigs {
        create("release") {
            // 개인용 사이드로드 키: 같은 키로 서명해야 지운 뒤 다시 설치하지 않고 업데이트된다
            storeFile = rootProject.file("keystore/danjam.jks")
            storePassword = "danjam-sleep"
            keyAlias = "danjam"
            keyPassword = "danjam-sleep"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

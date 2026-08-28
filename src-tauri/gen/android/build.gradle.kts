buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0")
        classpath("com.google.gms:google-services:4.5.0")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        // livekit-android pulls com.github.davidliu:audioswitch, published only
        // on JitPack.
        maven { setUrl("https://jitpack.io") }
    }
}

tasks.register("clean").configure {
    delete("build")
}


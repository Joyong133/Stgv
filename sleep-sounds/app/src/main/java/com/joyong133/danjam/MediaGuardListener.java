package com.joyong133.danjam;

import android.service.notification.NotificationListenerService;

/**
 * '알림 접근' 권한을 받기 위한 자리. 안드로이드는 이 권한이 있는 앱에만 다른 앱의 재생 상태를 보고
 * 멈출 수 있게 해 준다. 알림 내용은 전혀 읽지 않는다 (아무 메서드도 다시 정의하지 않았다).
 */
public final class MediaGuardListener extends NotificationListenerService {
}

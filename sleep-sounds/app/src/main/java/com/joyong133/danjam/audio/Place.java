package com.joyong133.danjam.audio;

/**
 * 3D 공간에서 소리가 놓이는 자리.
 * 방위각 az: 0 앞, 90 오른쪽, -90 왼쪽, 180 뒤 (도). 고도 el: 위가 +, 아래가 − (도).
 * 거리 dist (m). 퍼짐 width: 소리가 차지하는 폭 (도). 200 이상이면 사방에서 감싼다.
 */
public final class Place {
    public final float az, el, dist, width;

    public Place(float az, float el, float dist, float width) {
        this.az = az;
        this.el = el;
        this.dist = dist;
        this.width = width;
    }

    public Place withAzDist(float newAz, float newDist) {
        return new Place(newAz, el, newDist, width);
    }
}

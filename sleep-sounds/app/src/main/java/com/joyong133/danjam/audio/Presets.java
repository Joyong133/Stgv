package com.joyong133.danjam.audio;

/** 미리 만들어 둔 추천 조합. */
public final class Presets {
    public static final class Preset {
        public final String emoji, name, desc;
        public final String[] ids;
        public final int[] volumes;

        Preset(String emoji, String name, String desc, String[] ids, int[] volumes) {
            this.emoji = emoji;
            this.name = name;
            this.desc = desc;
            this.ids = ids;
            this.volumes = volumes;
        }
    }

    public static final Preset[] ALL = {
            new Preset("⛺", "비 오는 날 캠핑", "텐트 위로 떨어지는 비와 모닥불",
                    new String[]{"tent_rain", "campfire", "forest_rain"}, new int[]{75, 45, 25}),
            new Preset("⛈️", "폭풍우 치는 밤", "쏟아지는 비, 멀리서 울리는 천둥과 바람",
                    new String[]{"heavy_rain", "thunder", "wind"}, new int[]{70, 60, 35}),
            new Preset("🌾", "여름밤 시골집", "논두렁 개구리와 풀벌레, 시냇물",
                    new String[]{"frogs", "crickets", "brook"}, new int[]{60, 45, 25}),
            new Preset("🌊", "바닷가 오두막", "밀려오는 파도와 장작 타는 소리",
                    new String[]{"ocean", "campfire", "wind"}, new int[]{75, 30, 20}),
            new Preset("📖", "창가에서 책 읽기", "창문을 두드리는 비와 벽시계",
                    new String[]{"window_rain", "clock", "campfire"}, new int[]{75, 25, 25}),
            new Preset("🚂", "비 내리는 밤기차", "덜컹이는 기차와 차창의 빗소리",
                    new String[]{"train", "window_rain"}, new int[]{70, 40}),
            new Preset("🏯", "산사의 밤", "처마 끝 낙숫물과 풍경, 싱잉볼",
                    new String[]{"eaves", "chimes", "bowl", "crickets"}, new int[]{65, 35, 25, 25}),
            new Preset("🌲", "비 갠 숲속 아침", "잎에 맺힌 빗방울과 새소리, 시냇물",
                    new String[]{"forest_rain", "birds", "brook"}, new int[]{50, 45, 35}),
            new Preset("😴", "깊은 숙면", "브라운 노이즈 위로 잔잔한 비",
                    new String[]{"brown", "steady_rain"}, new int[]{60, 45}),
            new Preset("👶", "아기 재우기", "엄마 뱃속 소리와 오르골 자장가",
                    new String[]{"heartbeat", "musicbox", "pink"}, new int[]{60, 40, 20}),
            new Preset("✈️", "구름 위 꿀잠", "비행기 객실의 고른 소음",
                    new String[]{"airplane", "pink"}, new int[]{70, 20}),
            new Preset("🌌", "꿈속 여행", "몽환적인 앰비언트와 델타파",
                    new String[]{"drone", "binaural", "light_rain"}, new int[]{60, 30, 25}),
    };

    private Presets() {
    }
}

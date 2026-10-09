package com.joyong133.danjam.audio;

/** 앱에 들어 있는 모든 소리 목록. 이름·아이콘·분류와 음량 보정값, 합성기 생성. */
public final class SoundCatalog {
    public static final String[] CATEGORIES = {"빗소리", "자연", "생활", "노이즈", "명상"};
    public static final int RAIN = 0, NATURE = 1, LIFE = 2, NOISE = 3, CALM = 4;

    public static final class Sound {
        public final String id, name, emoji;
        public final int category;
        /** 소리끼리 체감 음량을 맞추는 보정 (dB) */
        public final float trimDb;

        Sound(String id, int category, String emoji, String name, float trimDb) {
            this.id = id;
            this.category = category;
            this.emoji = emoji;
            this.name = name;
            this.trimDb = trimDb;
        }

        /** 보정이 들어간 선형 이득 */
        public float trim() {
            return (float) Math.pow(10, trimDb / 20.0);
        }
    }

    public static final Sound[] ALL = {
            new Sound("drizzle", RAIN, "🌫️", "이슬비", 5.0f),
            new Sound("light_rain", RAIN, "🌦️", "보슬비", 4.0f),
            new Sound("steady_rain", RAIN, "🌧️", "잔잔한 비", 0.0f),
            new Sound("heavy_rain", RAIN, "💦", "장대비", -5.5f),
            new Sound("thunder", RAIN, "⛈️", "천둥", 0.5f),
            new Sound("tin_roof", RAIN, "🏚️", "양철 지붕", 3.0f),
            new Sound("window_rain", RAIN, "🌃", "창가의 비", 6.0f),
            new Sound("umbrella", RAIN, "☔", "우산 위의 비", 4.0f),
            new Sound("tent_rain", RAIN, "⛺", "텐트 위의 비", 7.5f),
            new Sound("forest_rain", RAIN, "🌲", "숲속의 비", -1.5f),
            new Sound("eaves", RAIN, "💧", "처마 끝 낙숫물", 7.0f),
            new Sound("car_rain", RAIN, "🚗", "차 안의 비", 7.0f),
            new Sound("puddle", RAIN, "🌂", "빗물 웅덩이", 6.0f),

            new Sound("ocean", NATURE, "🌊", "파도", 0.0f),
            new Sound("brook", NATURE, "🏞️", "시냇물", 7.0f),
            new Sound("waterfall", NATURE, "🏔️", "폭포", -3.0f),
            new Sound("wind", NATURE, "🌬️", "바람", 1.5f),
            new Sound("birds", NATURE, "🐦", "새소리", -11.5f),
            new Sound("crickets", NATURE, "🌾", "풀벌레", 3.0f),
            new Sound("frogs", NATURE, "🐸", "개구리", 2.5f),
            new Sound("campfire", NATURE, "🔥", "모닥불", 0.5f),
            new Sound("underwater", NATURE, "🐳", "물속", -0.5f),

            new Sound("fan", LIFE, "🌀", "선풍기", -3.0f),
            new Sound("train", LIFE, "🚂", "밤기차", -3.0f),
            new Sound("airplane", LIFE, "✈️", "비행기 안", -5.0f),
            new Sound("clock", LIFE, "🕰️", "벽시계", -2.0f),
            new Sound("purr", LIFE, "🐈", "고양이 골골송", 13.0f),
            new Sound("heartbeat", LIFE, "💓", "엄마 뱃속", 1.0f),

            new Sound("white", NOISE, "📻", "화이트 노이즈", -9.0f),
            new Sound("pink", NOISE, "🌸", "핑크 노이즈", -4.5f),
            new Sound("brown", NOISE, "🍂", "브라운 노이즈", 2.0f),
            new Sound("green", NOISE, "🌿", "그린 노이즈", -3.5f),

            new Sound("bowl", CALM, "🔔", "싱잉볼", 7.5f),
            new Sound("chimes", CALM, "🎐", "풍경 소리", -0.5f),
            new Sound("binaural", CALM, "🎧", "델타파 (이어폰)", -10.0f),
            new Sound("drone", CALM, "🌌", "꿈결 앰비언트", 4.5f),
            new Sound("musicbox", CALM, "🎶", "오르골 자장가", 1.5f),
    };

    private SoundCatalog() {
    }

    public static Sound get(String id) {
        for (Sound s : ALL) if (s.id.equals(id)) return s;
        return null;
    }

    public static Generator create(String id, float sr) {
        switch (id) {
            case "drizzle": return new RainGen(sr, RainGen.drizzle());
            case "light_rain": return new RainGen(sr, RainGen.light());
            case "steady_rain": return new RainGen(sr, RainGen.steady());
            case "heavy_rain": return new RainGen(sr, RainGen.heavy());
            case "thunder": return new ThunderGen(sr);
            case "tin_roof": return new RainGen(sr, RainGen.tinRoof());
            case "window_rain": return new RainGen(sr, RainGen.window());
            case "umbrella": return new RainGen(sr, RainGen.umbrella());
            case "tent_rain": return new RainGen(sr, RainGen.tent());
            case "forest_rain": return new RainGen(sr, RainGen.forest());
            case "eaves": return new RainGen(sr, RainGen.eaves());
            case "car_rain": return new RainGen(sr, RainGen.car());
            case "puddle": return new RainGen(sr, RainGen.puddle());
            case "ocean": return new OceanGen(sr);
            case "brook": return new BrookGen(sr, 120);
            case "waterfall": return new WaterfallGen(sr);
            case "wind": return new WindGen(sr, 0.05f);
            case "birds": return new BirdsGen(sr);
            case "crickets": return new CricketsGen(sr);
            case "frogs": return new FrogsGen(sr);
            case "campfire": return new FireGen(sr);
            case "underwater": return new UnderwaterGen(sr);
            case "fan": return new FanGen(sr);
            case "train": return new TrainGen(sr);
            case "airplane": return new CabinGen(sr);
            case "clock": return new ClockGen(sr);
            case "purr": return new PurrGen(sr);
            case "heartbeat": return new HeartbeatGen(sr);
            case "white": return new NoiseGen(sr, NoiseGen.WHITE);
            case "pink": return new NoiseGen(sr, NoiseGen.PINK);
            case "brown": return new NoiseGen(sr, NoiseGen.BROWN);
            case "green": return new NoiseGen(sr, NoiseGen.GREEN);
            case "bowl": return new BowlGen(sr);
            case "chimes": return new ChimesGen(sr);
            case "binaural": return new BinauralGen(sr);
            case "drone": return new DroneGen(sr);
            case "musicbox": return new MusicBoxGen(sr);
            default: return null;
        }
    }
}

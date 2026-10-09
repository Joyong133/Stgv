package com.joyong133.danjam.audio;

/** 앱에 들어 있는 모든 소리 목록. 이름·아이콘·분류·설명, 음량 보정값, 3D 기본 자리, 합성기 생성. */
public final class SoundCatalog {
    public static final String[] CATEGORIES = {"빗소리", "자연", "생활", "노이즈", "명상"};
    public static final int RAIN = 0, NATURE = 1, LIFE = 2, NOISE = 3, CALM = 4;

    public static final class Sound {
        public final String id, name, emoji, desc;
        public final int category;
        /** 소리끼리 체감 음량을 맞추는 보정 (dB) */
        public final float trimDb;
        /** 3D 공간에서의 기본 자리 */
        public final Place place;
        /** false 면 3D 로 옮기지 않는다 (바이노럴 비트처럼 좌우가 정확해야 하거나 머릿속에서 들려야 하는 소리) */
        public final boolean spatial;

        Sound(String id, int category, String emoji, String name, float trimDb, Place place, String desc) {
            this(id, category, emoji, name, trimDb, place, true, desc);
        }

        Sound(String id, int category, String emoji, String name, float trimDb, Place place, boolean spatial, String desc) {
            this.id = id;
            this.category = category;
            this.emoji = emoji;
            this.name = name;
            this.trimDb = trimDb;
            this.place = place;
            this.spatial = spatial;
            this.desc = desc;
        }

        /** 보정이 들어간 선형 이득 */
        public float trim() {
            return (float) Math.pow(10, trimDb / 20.0);
        }
    }

    private static Place at(float az, float el, float dist, float width) {
        return new Place(az, el, dist, width);
    }

    public static final Sound[] ALL = {
            new Sound("drizzle", RAIN, "🌫️", "이슬비", 5.0f, at(0, 25, 4, 240), "안개처럼 가늘게 흩뿌리는 비. 가장 조용한 빗소리예요."),
            new Sound("light_rain", RAIN, "🌦️", "보슬비", 5.0f, at(0, 25, 4, 240), "보슬보슬 내리는 가벼운 비. 빗방울 하나하나가 또렷해요."),
            new Sound("steady_rain", RAIN, "🌧️", "잔잔한 비", 1.0f, at(0, 25, 4, 240), "고르게 내리는 비. 무엇과 섞어도 잘 어울려요."),
            new Sound("heavy_rain", RAIN, "💦", "장대비", -5.0f, at(0, 25, 5, 260), "굵게 쏟아지는 비. 주변 소음을 가장 잘 덮어 줘요."),
            new Sound("shower", RAIN, "☂️", "소나기", 2.0f, at(0, 25, 5, 260), "세차게 몰려왔다가 잦아들기를 되풀이하는 여름 소나기."),
            new Sound("thunder", RAIN, "⛈️", "천둥", -4.5f, at(-35, 25, 12, 120), "먼 하늘에서 가끔 우르르 울리는 천둥. 다른 빗소리와 섞어 들으세요."),
            new Sound("tin_roof", RAIN, "🏚️", "양철 지붕", 3.0f, at(0, 65, 2, 220), "머리 위 양철 지붕을 두드리는 '타닥타닥' 빗소리."),
            new Sound("tile_roof", RAIN, "🏘️", "기와지붕", 5.5f, at(0, 55, 3, 220), "한옥 기와 위로 떨어지는 비와 골을 타고 흐르는 빗물."),
            new Sound("window_rain", RAIN, "🌃", "창가의 비", 6.0f, at(65, 5, 1.5f, 70), "방 안에서 듣는, 유리창을 두드리는 비와 밖의 먹먹한 빗소리."),
            new Sound("umbrella", RAIN, "☔", "우산 위의 비", 4.0f, at(0, 75, 0.6f, 150), "펼친 우산 위로 바로 떨어지는 '톡톡' 소리."),
            new Sound("tent_rain", RAIN, "⛺", "텐트 위의 비", 7.0f, at(0, 55, 1.2f, 240), "텐트 천을 두드리는 아늑한 빗소리."),
            new Sound("greenhouse", RAIN, "🌱", "비닐하우스", 5.5f, at(0, 60, 2.5f, 240), "비닐 지붕을 경쾌하게 두드리는 시골 빗소리."),
            new Sound("forest_rain", RAIN, "🌲", "숲속의 비", 1.5f, at(0, 35, 5, 260), "나뭇잎에 부딪히는 비와 잎에서 떨어지는 굵은 물방울."),
            new Sound("eaves", RAIN, "💧", "처마 끝 낙숫물", 6.0f, at(0, 15, 2.5f, 100), "처마 끝에서 '똑, 똑' 떨어지는 맑은 물방울."),
            new Sound("car_rain", RAIN, "🚗", "차 안의 비", 2.0f, at(0, 40, 1, 220), "세워 둔 차 안에서 듣는 지붕과 앞유리의 빗소리."),
            new Sound("puddle", RAIN, "🌂", "빗물 웅덩이", 6.0f, at(0, -35, 2.5f, 130), "웅덩이에 떨어지며 '퐁퐁' 터지는 빗방울."),
            new Sound("lake_rain", RAIN, "🦆", "빗속 호수", 7.5f, at(0, -15, 6, 200), "넓은 호수 수면에 수없이 떨어지는 빗방울."),
            new Sound("city_rain", RAIN, "🏙️", "비 오는 도시", 2.5f, at(0, 10, 6, 240), "빗길을 가끔 지나가는 자동차와 도시의 빗소리."),
            new Sound("cave", RAIN, "🦇", "동굴 물방울", 7.5f, at(0, 10, 6, 220), "깊은 동굴에 길게 울려 퍼지는 물방울 소리."),

            new Sound("ocean", NATURE, "🌊", "파도", 2.5f, at(0, -5, 7, 130), "밀려와 부서지고 거품을 남기며 빠져나가는 파도."),
            new Sound("lake", NATURE, "🌅", "호숫가 물결", 5.0f, at(-20, -10, 4, 100), "호숫가에 잔잔하게 찰랑이는 작은 물결."),
            new Sound("brook", NATURE, "🏞️", "시냇물", 4.5f, at(-55, -20, 3, 80), "돌 사이로 졸졸 흐르는 맑은 시냇물."),
            new Sound("river", NATURE, "🛶", "강물", 0.0f, at(40, -15, 6, 120), "묵직하게 흘러가는 넓은 강."),
            new Sound("waterfall", NATURE, "🏔️", "폭포", -3.0f, at(25, 0, 9, 90), "끊임없이 쏟아지는 폭포. 백색소음처럼 쓰기 좋아요."),
            new Sound("wind", NATURE, "🌬️", "바람", 1.0f, at(0, 20, 6, 260), "돌풍에 따라 높낮이가 바뀌는 바람."),
            new Sound("blizzard", NATURE, "🌨️", "눈보라", 0.5f, at(0, 15, 6, 260), "휘파람 소리를 내며 몰아치는 눈보라."),
            new Sound("snow", NATURE, "❄️", "눈 내리는 밤", 11.5f, at(0, 20, 8, 240), "소리가 눈에 묻힌 고요한 밤. 가끔 가지에서 눈이 떨어져요."),
            new Sound("bamboo", NATURE, "🎋", "대숲 바람", 0.5f, at(0, 30, 6, 240), "댓잎이 일렁이고 줄기끼리 '똑똑' 부딪히는 대나무 숲."),
            new Sound("birds", NATURE, "🐦", "새소리", -12.0f, at(0, 40, 7, 220), "아침 숲의 새들. 가까운 새와 멀리 있는 새들이 함께 노래해요."),
            new Sound("crickets", NATURE, "🌾", "풀벌레", 5.0f, at(0, -20, 5, 260), "가을밤 귀뚜라미와 방울벌레의 합창."),
            new Sound("frogs", NATURE, "🐸", "개구리", 5.0f, at(0, -15, 8, 200), "여름밤 논두렁의 개구리 합창."),
            new Sound("owl", NATURE, "🦉", "부엉이 우는 밤", -5.0f, at(-50, 30, 12, 150), "깊은 숲 저편의 부엉이와 잔잔한 밤바람."),
            new Sound("campfire", NATURE, "🔥", "모닥불", 6.0f, at(0, -25, 1.6f, 40), "타닥타닥 튀는 장작과 일렁이는 불길."),
            new Sound("underwater", NATURE, "🐳", "물속", -0.5f, at(0, 0, 2, 260), "먹먹하게 일렁이는 물속과 가끔 올라가는 기포."),
            new Sound("whale", NATURE, "🐋", "고래의 노래", 3.5f, at(0, 0, 6, 240), "깊은 바닷속에 울려 퍼지는 혹등고래의 노래."),

            new Sound("fan", LIFE, "🌀", "선풍기", -4.0f, at(40, 0, 2, 30), "고개를 천천히 돌리는 선풍기 바람."),
            new Sound("dryer", LIFE, "👕", "빨래 건조기", -1.5f, at(-60, -10, 2.5f, 30), "고르게 도는 건조기와 굴러 떨어지는 빨래."),
            new Sound("hairdryer", LIFE, "💨", "헤어드라이어", -5.0f, at(30, 10, 1, 20), "아기가 잘 자는 고른 드라이어 바람 소리."),
            new Sound("train", LIFE, "🚂", "밤기차", -2.5f, at(0, -10, 2, 240), "덜컹덜컹 레일을 달리는 기차 객실."),
            new Sound("car_drive", LIFE, "🛣️", "밤 드라이브", -3.0f, at(0, -10, 1.5f, 220), "고속도로를 달리는 차 안의 고른 소리."),
            new Sound("airplane", LIFE, "✈️", "비행기 안", -3.5f, at(0, 0, 2, 260), "구름 위를 나는 비행기 객실의 낮은 소음."),
            new Sound("ship", LIFE, "🚢", "배 선실", 1.5f, at(0, -10, 3, 220), "엔진이 고르게 돌고 나무 선실이 삐걱이는 밤배."),
            new Sound("clock", LIFE, "🕰️", "벽시계", -2.5f, at(-70, 20, 2.5f, 0), "오래된 벽시계의 '똑-딱'."),
            new Sound("purr", LIFE, "🐈", "고양이 골골송", 12.5f, at(35, -25, 0.5f, 0), "곁에 누운 고양이의 골골 소리."),
            new Sound("heartbeat", LIFE, "💓", "엄마 뱃속", 1.0f, at(0, 0, 0.3f, 0), false, "느린 심장 박동과 혈류 소리. 아기를 재울 때 좋아요."),

            new Sound("white", NOISE, "📻", "화이트 노이즈", -9.0f, at(0, 0, 2, 240), "모든 높이가 같은 세기인 '쉬-' 소리. 소음을 가장 넓게 덮어요."),
            new Sound("pink", NOISE, "🌸", "핑크 노이즈", -4.5f, at(0, 0, 2, 240), "높은 소리를 줄인 부드러운 노이즈. 빗소리와 가까워요."),
            new Sound("brown", NOISE, "🍂", "브라운 노이즈", 2.0f, at(0, 0, 2, 240), "낮고 묵직한 노이즈. 깊은 잠에 좋다고 많이 써요."),
            new Sound("green", NOISE, "🌿", "그린 노이즈", -3.5f, at(0, 0, 2, 240), "가운데 높이를 살린 노이즈. 자연의 소리와 비슷해요."),
            new Sound("grey", NOISE, "☁️", "그레이 노이즈", -2.5f, at(0, 0, 2, 240), "귀에 모든 높이가 비슷한 크기로 들리게 맞춘 노이즈."),

            new Sound("bowl", CALM, "🍵", "싱잉볼", 6.0f, at(0, 0, 2, 20), "가끔 한 번씩 길게 울리는 싱잉볼."),
            new Sound("temple_bell", CALM, "🔔", "산사의 범종", 8.0f, at(0, 10, 25, 60), "멀리 산사에서 울리는 범종. 맥놀이가 숨처럼 오르내려요."),
            new Sound("chimes", CALM, "🎐", "풍경 소리", 0.0f, at(50, 40, 3, 40), "바람이 불 때마다 맑게 울리는 풍경."),
            new Sound("binaural", CALM, "🎧", "델타파 (이어폰)", -10.0f, at(0, 0, 1, 0), false, "양쪽 귀에 2.5Hz 차이 나는 음. 깊은 잠의 뇌파 대역이에요."),
            new Sound("theta", CALM, "💫", "세타파 (이어폰)", -10.0f, at(0, 0, 1, 0), false, "양쪽 귀에 6Hz 차이 나는 음. 잠들기 직전의 뇌파 대역이에요."),
            new Sound("drone", CALM, "🌌", "꿈결 앰비언트", 6.5f, at(0, 10, 5, 260), "화음이 아주 천천히 피어올랐다 사라지는 배경음."),
            new Sound("piano", CALM, "🎹", "잔잔한 피아노", 9.5f, at(0, 0, 3, 60), "여유 있게 이어지는 즉흥 피아노. 매번 다른 선율이에요."),
            new Sound("musicbox", CALM, "🎶", "오르골 자장가", 2.0f, at(-20, -10, 1.2f, 20), "브람스의 자장가와 반짝반짝 작은 별."),
    };

    private SoundCatalog() {
    }

    public static Sound get(String id) {
        for (Sound s : ALL) if (s.id.equals(id)) return s;
        return null;
    }

    public static Generator create(String id, float sr) {
        if (id.startsWith("breath:")) return new BreathGen(sr, id.substring(7));
        switch (id) {
            case "drizzle": return new RainGen(sr, RainGen.drizzle());
            case "light_rain": return new RainGen(sr, RainGen.light());
            case "steady_rain": return new RainGen(sr, RainGen.steady());
            case "heavy_rain": return new RainGen(sr, RainGen.heavy());
            case "shower": return new RainGen(sr, RainGen.shower());
            case "thunder": return new ThunderGen(sr);
            case "tin_roof": return new RainGen(sr, RainGen.tinRoof());
            case "tile_roof": return new RainGen(sr, RainGen.tileRoof());
            case "window_rain": return new RainGen(sr, RainGen.window());
            case "umbrella": return new RainGen(sr, RainGen.umbrella());
            case "tent_rain": return new RainGen(sr, RainGen.tent());
            case "greenhouse": return new RainGen(sr, RainGen.greenhouse());
            case "forest_rain": return new RainGen(sr, RainGen.forest());
            case "eaves": return new RainGen(sr, RainGen.eaves());
            case "car_rain": return new RainGen(sr, RainGen.car());
            case "puddle": return new RainGen(sr, RainGen.puddle());
            case "lake_rain": return new RainGen(sr, RainGen.lake());
            case "city_rain": return new RainGen(sr, RainGen.city());
            case "cave": return new RainGen(sr, RainGen.cave());
            case "ocean": return new OceanGen(sr);
            case "lake": return new OceanGen(sr, true);
            case "brook": return new BrookGen(sr, 110);
            case "river": return new BrookGen(sr, 45, true);
            case "waterfall": return new WaterfallGen(sr);
            case "wind": return new WindGen(sr, 0.05f);
            case "blizzard": return new WindGen(sr, 0.35f, 0.06f);
            case "snow": return new SnowGen(sr);
            case "bamboo": return new BambooGen(sr);
            case "birds": return new BirdsGen(sr);
            case "crickets": return new CricketsGen(sr);
            case "frogs": return new FrogsGen(sr);
            case "owl": return new OwlGen(sr);
            case "campfire": return new FireGen(sr);
            case "underwater": return new UnderwaterGen(sr);
            case "whale": return new WhaleGen(sr);
            case "fan": return new FanGen(sr);
            case "dryer": return new DryerGen(sr);
            case "hairdryer": return new HairDryerGen(sr);
            case "train": return new TrainGen(sr);
            case "car_drive": return new CarDriveGen(sr);
            case "airplane": return new CabinGen(sr);
            case "ship": return new ShipGen(sr);
            case "clock": return new ClockGen(sr);
            case "purr": return new PurrGen(sr);
            case "heartbeat": return new HeartbeatGen(sr);
            case "white": return new NoiseGen(sr, NoiseGen.WHITE);
            case "pink": return new NoiseGen(sr, NoiseGen.PINK);
            case "brown": return new NoiseGen(sr, NoiseGen.BROWN);
            case "green": return new NoiseGen(sr, NoiseGen.GREEN);
            case "grey": return new NoiseGen(sr, NoiseGen.GREY);
            case "bowl": return new BowlGen(sr);
            case "temple_bell": return new TempleBellGen(sr);
            case "chimes": return new ChimesGen(sr);
            case "binaural": return new BinauralGen(sr, 2.5f);
            case "theta": return new BinauralGen(sr, 6f);
            case "drone": return new DroneGen(sr);
            case "piano": return new PianoGen(sr);
            case "musicbox": return new MusicBoxGen(sr);
            default: return null;
        }
    }
}

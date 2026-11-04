#!/usr/bin/env python3
"""AndroidManifest.xml(텍스트)을 안드로이드가 읽는 바이너리 XML(AXML)로 변환한다.

aapt2 없이 APK를 만들기 위한 작은 인코더다. 리소스(res/)가 없는 앱만 대상으로 하며,
android: 속성은 아래 ATTR_IDS 표에 있는 것만 쓸 수 있다.
사용법: python3 axml.py AndroidManifest.xml out.bin
"""
import struct
import sys
import xml.etree.ElementTree as ET

ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# android.R.attr 값 (android.jar 의 android.R$attr 에서 확인)
ATTR_IDS = {
    'theme': 0x01010000, 'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003,
    'exported': 0x01010010, 'excludeFromRecents': 0x01010017, 'launchMode': 0x0101001d,
    'minSdkVersion': 0x0101020c, 'versionCode': 0x0101021b, 'versionName': 0x0101021c,
    'targetSdkVersion': 0x01010270,
}
# @android:drawable/... 참조 (android.R$drawable)
FRAMEWORK_REFS = {
    '@android:drawable/ic_lock_lock': 0x0108002f,
    '@android:drawable/ic_lock_idle_lock': 0x0108001f,
}
INT_ATTRS = {'versionCode', 'minSdkVersion', 'targetSdkVersion'}
ENUM_ATTRS = {'launchMode': {'standard': 0, 'singleTop': 1, 'singleTask': 2, 'singleInstance': 3}}

TYPE_REFERENCE, TYPE_STRING, TYPE_INT_DEC, TYPE_INT_BOOLEAN = 0x01, 0x03, 0x10, 0x12
NO_INDEX = 0xFFFFFFFF


def encode(xml_text):
    root = ET.fromstring(xml_text)

    # 1) 문자열 풀: 리소스 ID가 있는 속성 이름을 맨 앞에(리소스 맵과 같은 순서로) 둔다
    elems = list(root.iter())
    res_names = []
    for e in elems:
        for k in e.attrib:
            if k.startswith('{%s}' % ANDROID_NS):
                n = k.split('}', 1)[1]
                if n not in ATTR_IDS:
                    raise SystemExit('알 수 없는 android: 속성: ' + n)
                if n not in res_names:
                    res_names.append(n)
    res_names.sort(key=lambda n: ATTR_IDS[n])
    strings = list(res_names)

    def idx(s):
        if s not in strings:
            strings.append(s)
        return strings.index(s)

    idx('android'); idx(ANDROID_NS)

    def split(k):
        if k.startswith('{'):
            ns, n = k[1:].split('}', 1)
            return ns, n
        return None, k

    body = []

    def node(chunk_type, ext):
        size = 16 + len(ext)
        return struct.pack('<HHIII', chunk_type, 16, size, 1, NO_INDEX) + ext

    body.append(node(0x0100, struct.pack('<II', idx('android'), idx(ANDROID_NS))))

    def walk(e):
        ns, tag = split(e.tag)
        attrs = []
        for k, v in e.attrib.items():
            ans, an = split(k)
            raw = NO_INDEX
            if ans == ANDROID_NS and v.startswith('@'):
                if v not in FRAMEWORK_REFS:
                    raise SystemExit('알 수 없는 참조: ' + v)
                dtype, data = TYPE_REFERENCE, FRAMEWORK_REFS[v]
            elif ans == ANDROID_NS and an in ENUM_ATTRS:
                dtype, data = TYPE_INT_DEC, ENUM_ATTRS[an][v]
            elif ans == ANDROID_NS and an in INT_ATTRS:
                dtype, data = TYPE_INT_DEC, int(v)
            elif ans == ANDROID_NS and v in ('true', 'false'):
                dtype, data = TYPE_INT_BOOLEAN, 0xFFFFFFFF if v == 'true' else 0
            else:
                raw = idx(v)
                dtype, data = TYPE_STRING, raw
            ns_i = idx(ANDROID_NS) if ans == ANDROID_NS else NO_INDEX
            sort_key = ATTR_IDS.get(an, 0x7FFFFFFF) if ans == ANDROID_NS else 0x7FFFFFFF
            attrs.append((sort_key, struct.pack('<IIIHBBI', ns_i, idx(an), raw, 8, 0, dtype, data)))
        # 안드로이드는 속성이 리소스 ID 순으로 정렬돼 있다고 가정하고 읽는다
        attrs.sort(key=lambda a: a[0])
        ns_i = idx(ns) if ns else NO_INDEX
        ext = struct.pack('<IIHHHHHH', ns_i, idx(tag), 20, 20, len(attrs), 0, 0, 0)
        body.append(node(0x0102, ext + b''.join(a[1] for a in attrs)))
        for c in e:
            walk(c)
        body.append(node(0x0103, struct.pack('<II', ns_i, idx(tag))))

    walk(root)
    body.append(node(0x0101, struct.pack('<II', idx('android'), idx(ANDROID_NS))))

    # 2) 문자열 풀 청크 (UTF-16)
    offs, data = [], b''
    for s in strings:
        offs.append(len(data))
        u = s.encode('utf-16-le')
        data += struct.pack('<H', len(u) // 2) + u + b'\0\0'
    while len(data) % 4:
        data += b'\0'
    hdr = 28
    strings_start = hdr + 4 * len(strings)
    pool = struct.pack('<HHIIIIII', 0x0001, hdr, strings_start + len(data),
                       len(strings), 0, 0, strings_start, 0)
    pool += b''.join(struct.pack('<I', o) for o in offs) + data

    # 3) 리소스 맵
    resmap = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(res_names))
    resmap += b''.join(struct.pack('<I', ATTR_IDS[n]) for n in res_names)

    content = pool + resmap + b''.join(body)
    return struct.pack('<HHI', 0x0003, 8, 8 + len(content)) + content


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as f:
        out = encode(f.read())
    with open(sys.argv[2], 'wb') as f:
        f.write(out)

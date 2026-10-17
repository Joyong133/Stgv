"""Minimal zipalign: rewrites a zip so every STORED entry's data starts on a 4-byte boundary.
Usage: python3 zipalign.py in.apk out.apk"""
import struct
import sys
import zipfile

ALIGN = 4


def main(src, dst):
    data = open(src, "rb").read()
    infos = zipfile.ZipFile(src).infolist()
    out = bytearray()
    central = bytearray()
    for info in infos:
        off = info.header_offset
        hdr = data[off:off + 30]
        (sig, ver, flag, method, mtime, mdate, crc, csize, usize, nlen, elen) = struct.unpack("<IHHHHHIIIHH", hdr)
        name = data[off + 30:off + 30 + nlen]
        start = off + 30 + nlen + elen
        body = data[start:start + info.compress_size]
        extra = b""
        if method == 0:
            pad = (-(len(out) + 30 + nlen)) % ALIGN
            extra = b"\0" * pad
        new_off = len(out)
        flag &= ~0x08  # sizes are in the header, no data descriptor
        out += struct.pack("<IHHHHHIIIHH", sig, ver, flag, method, mtime, mdate,
                           info.CRC, info.compress_size, info.file_size, nlen, len(extra))
        out += name + extra + body
        central += struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, (info.create_system << 8) | info.create_version,
                               ver, flag, method, mtime, mdate, info.CRC, info.compress_size, info.file_size,
                               nlen, 0, 0, 0, 0, info.external_attr, new_off)
        central += name
    cd_off = len(out)
    out += central
    out += struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(infos), len(infos), len(central), cd_off, 0)
    open(dst, "wb").write(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

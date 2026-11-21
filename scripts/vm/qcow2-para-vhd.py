"""qcow2 (imagem de nuvem do Fedora, Ubuntu, Arch) -> VHD fixo, que o Hyper-V lê (depois o criar.ps1 passa para VHDX
dinâmico). Sem ferramenta extra: lê as tabelas L1/L2 do qcow2, descompacta os clusters (deflate) e no fim põe o rodapé
do VHD.
    python -I scripts/vm/qcow2-para-vhd.py <entrada.qcow2> <saida.vhd>
"""
import struct
import sys
import time
import uuid
import zlib


def converter(entrada: str, saida: str) -> None:
    with open(entrada, "rb") as f, open(saida, "wb") as o:
        cab = f.read(112)
        if cab[:4] != b"QFI\xfb":
            raise SystemExit("não é qcow2")
        versao, = struct.unpack(">I", cab[4:8])
        backing, = struct.unpack(">Q", cab[8:16])
        bits, = struct.unpack(">I", cab[20:24])
        tamanho, = struct.unpack(">Q", cab[24:32])
        cripto, = struct.unpack(">I", cab[32:36])
        l1_n, = struct.unpack(">I", cab[36:40])
        l1_pos, = struct.unpack(">Q", cab[40:48])
        if backing or cripto:
            raise SystemExit("qcow2 com imagem base ou criptografia: não suportado")
        if versao >= 3:
            compat_len, = struct.unpack(">I", cab[100:104])
            if compat_len > 104 and cab[104] != 0:
                raise SystemExit("qcow2 compactado com zstd: não suportado (só deflate)")
        cl = 1 << bits
        x = 62 - (bits - 8)
        mascara_off = (1 << 56) - 1 & ~511
        f.seek(l1_pos)
        l1 = struct.unpack(f">{l1_n}Q", f.read(8 * l1_n))
        por_l2 = cl // 8
        o.truncate(tamanho)
        feitos = 0
        for i, e1 in enumerate(l1):
            l2_pos = e1 & mascara_off
            if not l2_pos:
                continue
            f.seek(l2_pos)
            l2 = struct.unpack(f">{por_l2}Q", f.read(cl))
            for j, e2 in enumerate(l2):
                destino = (i * por_l2 + j) * cl
                if destino >= tamanho or not e2:
                    continue
                if e2 & (1 << 62):  # compactado
                    d = e2 & ((1 << 62) - 1)
                    pos = d & ((1 << x) - 1)
                    setores = (d >> x) + 1
                    f.seek(pos)
                    dados = zlib.decompressobj(-15).decompress(f.read(setores * 512 - (pos & 511)), cl)
                else:
                    if e2 & 1:  # cluster todo de zeros (v3)
                        continue
                    pos = e2 & mascara_off
                    if not pos:
                        continue
                    f.seek(pos)
                    dados = f.read(cl)
                o.seek(destino)
                o.write(dados[: min(cl, tamanho - destino)])
                feitos += 1
        o.seek(tamanho)
        o.write(rodape_vhd(tamanho))
    print(f"{saida}: {tamanho / 2**30:.1f} GB, {feitos} clusters com dados")


def geometria(setores: int) -> tuple[int, int, int]:
    """Cilindros, cabeças e setores por trilha, como manda a especificação do VHD."""
    setores = min(setores, 65535 * 16 * 255)
    if setores >= 65535 * 16 * 63:
        spt, cab = 255, 16
        cyl_cab = setores // spt
    else:
        spt = 17
        cyl_cab = setores // spt
        cab = max((cyl_cab + 1023) // 1024, 4)
        if cyl_cab >= cab * 1024 or cab > 16:
            spt, cab = 31, 16
            cyl_cab = setores // spt
        if cyl_cab >= cab * 1024:
            spt, cab = 63, 16
            cyl_cab = setores // spt
    return cyl_cab // cab, cab, spt


def rodape_vhd(tamanho: int) -> bytes:
    c, h, s = geometria(tamanho // 512)
    r = bytearray(512)
    struct.pack_into(">8sIIQI4sI4sQQHBBII16sB", r, 0,
                     b"conectix", 2, 0x00010000, 0xFFFFFFFFFFFFFFFF, int(time.time()) - 946684800,
                     b"atlr", 0x00010000, b"Wi2k", tamanho, tamanho, c, h, s, 2, 0, uuid.uuid4().bytes, 0)
    soma = (~sum(r)) & 0xFFFFFFFF
    struct.pack_into(">I", r, 64, soma)
    return bytes(r)


if __name__ == "__main__":
    converter(sys.argv[1], sys.argv[2])

import sys,random
from PIL import Image,ImageDraw,ImageFont,ImageFilter
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',34) if __import__('os').path.exists('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') else ImageFont.load_default()
def page(lines,mode):
    im=Image.new('L',(1654,1169),255);d=ImageDraw.Draw(im)
    for i,l in enumerate(lines):d.text((100,100+i*70),l,font=f,fill=0)
    if mode=='blur':im=im.filter(ImageFilter.GaussianBlur(2.2))
    if mode=='noise':
        px=im.load();random.seed(1)
        for _ in range(60000):px[random.randrange(im.width),random.randrange(im.height)]=random.choice([0,255])
        im=im.rotate(2.5,fillcolor=255)
    return im
L=['Rechazo de declaracion','DUA 26ES00110012345678 expediente EXP-2026-014','Bultos 12 Peso 340,5 kg','Transporte TR-0042']
for m in ['clean','blur','noise']:
    page(L,m).save(sys.argv[1]+f'/{m}.pdf',resolution=200)
Image.new('L',(800,600),255).save(sys.argv[1]+'/blank.pdf',resolution=100)

"""每一步的昼夜截图与定稿图等高并排，左定稿，右网页。"""
import sys
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
root=Path(__file__).resolve().parents[1]
step=sys.argv[1]
out=Image.new('RGB',(1800,1400),'#eee5d8')
d=ImageDraw.Draw(out)
for row,(mode,ref) in enumerate([('day','图2.png'),('night','图4.png')]):
    for col,path in enumerate([root/'定稿图4选1'/ref,root/f'docs/screenshots/{step}-{mode}.jpg']):
        img=ImageOps.contain(Image.open(path).convert('RGB'),(890,650))
        out.paste(img,(col*900+(900-img.width)//2,row*700+40+(650-img.height)//2))
        d.text((col*900+20,row*700+15),f'{mode.upper()} / {"REFERENCE" if col==0 else step.upper()}',fill='#483d30')
out.save(root/f'docs/screenshots/{step}-compare.jpg',quality=90)

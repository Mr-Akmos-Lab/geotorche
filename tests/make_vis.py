import json, random, io, numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from skimage import data
random.seed(7); np.random.seed(7)
OUT='tests/vis/'
bases={}
for n in ['astronaut','chelsea','coffee','rocket','immunohistochemistry','hubble_deep_field','retina','camera','brick','grass','gravel','clock','horse','coins','moon']:
    im=getattr(data,n)()
    bases[n]=im
L,R,_=data.stereo_motorcycle(); bases['motoL']=L; bases['motoR']=R
def prep(a):
    a=np.asarray(a)
    if a.dtype==bool: a=(a*255).astype(np.uint8)
    elif a.dtype!=np.uint8: a=(255*(a-a.min())/(np.ptp(a) or 1)).astype(np.uint8)
    im=Image.fromarray(a if a.ndim==3 else np.stack([a]*3,-1)).convert('RGB')
    s=900/min(im.size); im=im.resize((max(900,round(im.size[0]*s)),max(900,round(im.size[1]*s))),Image.BICUBIC)
    w,h=im.size; return im.crop(((w-900)//2,(h-900)//2,(w-900)//2+900,(h-900)//2+900))
big={k:prep(v) for k,v in bases.items()}
def crop640(im): return im.crop((130,130,770,770))
def photometric(im,strong=1.0):
    im=ImageEnhance.Brightness(im).enhance(random.uniform(1-0.35*strong,1+0.35*strong))
    im=ImageEnhance.Contrast(im).enhance(random.uniform(0.8,1.2))
    a=np.asarray(im).astype(np.float32); a[...,0]*=random.uniform(0.9,1.1); a[...,2]*=random.uniform(0.9,1.1)
    a+=np.random.normal(0,random.uniform(0,6),a.shape); im=Image.fromarray(np.clip(a,0,255).astype(np.uint8))
    im=im.filter(ImageFilter.GaussianBlur(random.uniform(0,1.4)))
    b=io.BytesIO(); im.save(b,'JPEG',quality=random.randint(60,90)); return Image.open(io.BytesIO(b.getvalue())).convert('RGB')
def geom(im,shift=0.08,rot=8,sc=(0.85,1.2),persp=0.06):
    c=450; ang=random.uniform(-rot,rot); s=random.uniform(*sc)
    tx=random.uniform(-shift,shift)*640; ty=random.uniform(-shift,shift)*640
    im=im.rotate(ang,resample=Image.BICUBIC,center=(c,c),translate=(tx,ty))
    if s!=1:
        w=round(900*s); im2=im.resize((w,w),Image.BICUBIC)
        if w>=900: o=(w-900)//2; im=im2.crop((o,o,o+900,o+900))
        else: canvas=Image.new('RGB',(900,900)); canvas.paste(im2,((900-w)//2,(900-w)//2)); im=canvas
    # perspective
    src=[(0,0),(900,0),(900,900),(0,900)]; j=lambda: random.uniform(-persp,persp)*900
    dst=[(x+j(),y+j()) for x,y in src]
    A=[];B=[]
    for (x,y),(X,Y) in zip(src,dst):
        A+= [[X,Y,1,0,0,0,-x*X,-x*Y],[0,0,0,X,Y,1,-y*X,-y*Y]]; B+=[x,y]
    coeffs=np.linalg.solve(np.array(A,float),np.array(B,float))
    im=im.transform((900,900),Image.PERSPECTIVE,tuple(coeffs),Image.BICUBIC)
    return crop640(im)
man={'refs':{},'pos':[],'neg':[]}
names=list(big)
for n in names:
    f=f'{n}_ref.jpg'; crop640(big[n]).save(OUT+f,quality=90); man['refs'][n]=f
    for i in range(6):
        f=f'{n}_pos{i}.jpg'; photometric(geom(big[n])).save(OUT+f,quality=92); man['pos'].append([n,f])
    for i in range(3):  # même pièce, autre endroit
        dx=random.choice([-1,1])*random.uniform(0.42,0.55)*640; dy=random.uniform(-0.2,0.2)*640
        im=big[n].rotate(0,translate=(dx,dy)); f=f'{n}_near{i}.jpg'; photometric(crop640(im)).save(OUT+f,quality=92); man['neg'].append([n,f,'near'])
# vue réelle différente : moto gauche/droite
man['pos'].append(['motoL','motoR_ref.jpg']); man['pos'].append(['motoR','motoL_ref.jpg'])
for n in names:
    for m in random.sample([x for x in names if x!=n and {x,n}!={'motoL','motoR'}],5):
        f=f'{m}_pos{random.randint(0,5)}.jpg'; man['neg'].append([n,f,'other'])
json.dump(man,open(OUT+'manifest.json','w'))
print(len(man['pos']),len(man['neg']))

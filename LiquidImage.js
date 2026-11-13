import{t as e}from"./rolldown-runtime.Bi-D_2cA.mjs";import{I as t,R as n,_ as r,b as i,l as a,o,s,w as c,y as l}from"./react.Dxe_2v0O.mjs";import{T as u,m as d,t as f}from"./motion.x14TTX80.mjs";import{E as p,U as m,o as h,pt as g}from"./framer.BLEq7rAX.mjs";function _(e){let{image:t,radius:s,ripple:c,hoverZoom:f,rgbShift:p,scrollBend:m,parallax:h,reveal:_,revealDuration:S}=e,C=t&&t.alt||e.alt||``,w=t&&t.src,T=g(),E=i(null),D=i(null),O=i(null),[k,A]=r(!1),j=i(e.hoverTransition);j.current=e.hoverTransition;let M=i(e.cursorFollow);M.current=e.cursorFollow,l(()=>{if(T||!w||n===void 0)return;let e=E.current,t=D.current,r=O.current;if(!e||!t||!r)return;let i=n.matchMedia(`(prefers-reduced-motion: reduce)`).matches,a=n.matchMedia(`(pointer: fine)`).matches,o=-1,s=Math.max(.2,S)*1e3,l=_&&!i;if(l){let r=e.getBoundingClientRect();r.top<n.innerHeight*.9&&r.bottom>0?o=0:(t.style.clipPath=`inset(14% 10% 14% 10%)`,t.style.transform=`scale(1.12)`)}let g=r.getContext(`webgl`,{premultipliedAlpha:!1,antialias:!1,alpha:!1}),C=null,k=null,N={},P=1,F=1,I=!1;if(g){let e=(e,t)=>{let n=g.createShader(e);return g.shaderSource(n,t),g.compileShader(n),n};C=g.createProgram(),g.attachShader(C,e(g.VERTEX_SHADER,y)),g.attachShader(C,e(g.FRAGMENT_SHADER,b)),g.linkProgram(C),g.getProgramParameter(C,g.LINK_STATUS)||(C=null)}if(g&&C){g.useProgram(C);let t=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,t),g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);let r=g.getAttribLocation(C,`aPos`);g.enableVertexAttribArray(r),g.vertexAttribPointer(r,2,g.FLOAT,!1,0,0),[`uTex`,`uRes`,`uImg`,`uMouse`,`uHover`,`uTime`,`uVel`,`uZoom`,`uPar`,`uRipple`,`uRgb`].forEach(e=>N[e]=g.getUniformLocation(C,e)),k=g.createTexture();let i=new Image;i.crossOrigin=`anonymous`,i.onload=()=>{if(g&&k){P=i.naturalWidth||1,F=i.naturalHeight||1,g.bindTexture(g.TEXTURE_2D,k),g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,!0);try{g.texImage2D(g.TEXTURE_2D,0,g.RGB,g.RGB,g.UNSIGNED_BYTE,i)}catch{return}g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR),g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR),g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE),g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE),I=!0,A(!0)}};let a=Math.min(2400,Math.round(e.clientWidth*Math.min(2,n.devicePixelRatio||1)));i.src=w.includes(`framerusercontent.com`)?`${w.split(`?`)[0]}?scale-down-to=${a>1600?2048:a>800?1024:512}`:w}let L=.5,R=.5,z=.5,B=.5,V=u(0),H=null,U=e=>{H&&H.stop(),H=d(V,e,j.current||v)},W=0,G=n.scrollY,K=!0,q=t=>{let n=e.getBoundingClientRect();z=(t.clientX-n.left)/n.width,B=1-(t.clientY-n.top)/n.height},J=e=>{q(e),V.get()<.02&&(L=z,R=B),U(1)},Y=()=>{U(0)};a&&!i&&(e.addEventListener(`pointermove`,q),e.addEventListener(`pointerenter`,J),e.addEventListener(`pointerleave`,Y));let X=new IntersectionObserver(e=>e.forEach(e=>{K=e.isIntersecting,K&&l&&o<0&&e.intersectionRatio>0&&(o=performance.now())}),{threshold:[0,.15]});X.observe(e);let Z=()=>{let t=Math.min(2,n.devicePixelRatio||1),i=Math.max(1,Math.round(e.clientWidth*t)),a=Math.max(1,Math.round(e.clientHeight*t));(r.width!==i||r.height!==a)&&(r.width=i,r.height=a)},Q=new ResizeObserver(Z);Q.observe(e),Z();let $=0,ee=performance.now(),te=a=>{$=requestAnimationFrame(te);let u=1;if(l&&o!==0){u=o<0?0:x((a-o)/s);let e=1-u;t.style.clipPath=u>=1?``:`inset(${14*e}% ${10*e}% ${14*e}% ${10*e}%)`,t.style.transform=u>=1?``:`scale(${1+.12*e})`,u>=1&&(o=0)}if(!K)return;let d=n.scrollY,_=(d-G)/Math.max(1,n.innerHeight);G=d,W+=(Math.max(-.4,Math.min(.4,_*6))*(i?0:m)-W)*.12;let v=Math.max(0,V.get()),y=.02+Math.max(.02,Math.min(1,M.current??.5))*.3;if(L+=(z-L)*y,R+=(B-R)*y,!g||!C||!I)return;let b=e.getBoundingClientRect(),S=(b.top+b.height/2)/n.innerHeight-.5,w=i?0:Math.max(-.6,Math.min(.6,S))*.1*h,T=1+.12*h+(i?0:.18*(1-u));g.viewport(0,0,r.width,r.height),g.uniform1i(N.uTex,0),g.uniform2f(N.uRes,r.width,r.height),g.uniform2f(N.uImg,P,F),g.uniform2f(N.uMouse,L,R),g.uniform1f(N.uHover,v),g.uniform1f(N.uTime,(a-ee)/1e3),g.uniform1f(N.uVel,W),g.uniform1f(N.uZoom,T*(1+f*v)),g.uniform1f(N.uPar,-w),g.uniform1f(N.uRipple,c),g.uniform1f(N.uRgb,p),g.drawArrays(g.TRIANGLE_STRIP,0,4)};return $=requestAnimationFrame(te),()=>{if(cancelAnimationFrame($),H&&H.stop(),X.disconnect(),Q.disconnect(),e.removeEventListener(`pointermove`,q),e.removeEventListener(`pointerenter`,J),e.removeEventListener(`pointerleave`,Y),t.style.clipPath=``,t.style.transform=``,g){let e=g.getExtension(`WEBGL_lose_context`);e&&e.loseContext()}A(!1)}},[T,w,c,f,p,m,h,_,S]);let N={position:`absolute`,inset:0,width:`100%`,height:`100%`};return/*#__PURE__*/ o(`div`,{ref:E,style:{...e.style,position:`relative`,width:`100%`,height:`100%`,overflow:`hidden`,borderRadius:s,background:`#111114`,isolation:`isolate`},children:/*#__PURE__*/ a(`div`,{ref:D,style:{...N,willChange:`transform, clip-path`},children:[w?/*#__PURE__*/ o(`img`,{src:w,srcSet:t&&t.srcSet,alt:C,draggable:!1,style:{...N,objectFit:`cover`,display:`block`,opacity:+!k}}):/*#__PURE__*/ o(`div`,{style:{...N,display:`flex`,alignItems:`center`,justifyContent:`center`,color:`rgba(237,235,230,.5)`,font:`12px monospace`,letterSpacing:`.08em`,textTransform:`uppercase`},children:`Liquid Image — add an image`}),!T&&/*#__PURE__*/ o(`canvas`,{ref:O,"aria-hidden":`true`,style:{...N,display:`block`,opacity:+!!k}})]})})}var v,y,b,x;function S(){return(S=e((()=>{t(),s(),c(),m(),f(),v={type:`spring`,duration:1,bounce:0},y=`
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`,b=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uImg;
uniform vec2 uMouse;
uniform float uHover;
uniform float uTime;
uniform float uVel;
uniform float uZoom;
uniform float uPar;
uniform float uRipple;
uniform float uRgb;
vec2 cover(vec2 uv){
  float rs = uRes.x / uRes.y;
  float ri = uImg.x / uImg.y;
  vec2 s = rs < ri ? vec2(rs / ri, 1.0) : vec2(1.0, ri / rs);
  return (uv - 0.5) * s + 0.5;
}
void main(){
  vec2 uv = vUv;
  uv.y += sin(uv.x * 3.14159) * uVel * 0.12;
  vec2 p = uv - uMouse;
  p.x *= uRes.x / uRes.y;
  float d = length(p);
  float wave = sin(d * 26.0 - uTime * 4.0) * exp(-d * 4.5) * uHover * uRipple * 0.022;
  uv += normalize(p + 0.00001) * wave;
  uv = (uv - 0.5) / uZoom + 0.5;
  uv.y += uPar;
  vec2 t = cover(uv);
  float sh = uRgb * uHover * 0.005 + abs(uVel) * 0.015;
  vec4 c;
  c.r = texture2D(uTex, t + vec2(sh, 0.0)).r;
  c.g = texture2D(uTex, t).g;
  c.b = texture2D(uTex, t - vec2(sh, 0.0)).b;
  c.a = 1.0;
  gl_FragColor = c;
}`,x=e=>1-(1-Math.min(1,Math.max(0,e)))**4,_.defaultProps={alt:``,radius:6,hoverTransition:v,cursorFollow:.4,ripple:1,hoverZoom:.06,rgbShift:1,scrollBend:1,parallax:1,reveal:!0,revealDuration:1.6},p(_,{image:{type:h.ResponsiveImage,title:`Image`},alt:{type:h.String,title:`Alt Text`,description:`Used if the image has no alt text.`},radius:{type:h.Number,title:`Radius`,min:0,max:80,unit:`px`,defaultValue:6},hoverTransition:{type:h.Transition,title:`Hover Transition`,defaultValue:v},cursorFollow:{type:h.Number,title:`Cursor Follow`,min:0,max:1,step:.05,defaultValue:.4,description:`Lower = the ripple trails behind the cursor.`},ripple:{type:h.Number,title:`Hover Ripple`,min:0,max:3,step:.1,defaultValue:1},hoverZoom:{type:h.Number,title:`Hover Zoom`,min:0,max:.3,step:.01,defaultValue:.06},rgbShift:{type:h.Number,title:`RGB Shift`,min:0,max:3,step:.1,defaultValue:1},scrollBend:{type:h.Number,title:`Scroll Bend`,min:0,max:3,step:.1,defaultValue:1},parallax:{type:h.Number,title:`Parallax`,min:0,max:2,step:.1,defaultValue:1},reveal:{type:h.Boolean,title:`Reveal`,defaultValue:!0},revealDuration:{type:h.Number,title:`Reveal Time`,min:.3,max:4,step:.1,unit:`s`,defaultValue:1.6,hidden:e=>!e.reveal}})})))()}export{S as n,_ as t};
//# sourceMappingURL=LiquidImage.mylaXKmg.mjs.map
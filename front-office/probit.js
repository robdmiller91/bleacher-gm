function inv(p){// Acklam inverse normal
const a=[-39.69683028665376,220.9460984245205,-275.9285104469687,138.357751867269,-30.66479806614716,2.506628277459239],b=[-54.47609879822406,161.5858368580409,-155.6989798598866,66.80131188771972,-13.28068155288572],c=[-0.007784894002430293,-0.3223964580411365,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783],d=[0.007784695709041462,0.3224671290700398,2.445134137142996,3.754408661907416];
const pl=0.02425;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
if(p>1-pl){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
function run(argv){const app=Application.currentApplication();app.includeStandardAdditions=true;
const T=app.read(Path(argv[0]+'/targets.txt')).trim().split('\n').map(l=>{const f=l.split('|');return {pos:f[0],g:+f[3],o:+f[4]};});
const out=[];['WR','QB','RB','TE'].forEach(P=>{const ts=T.filter(t=>t.pos===P);const z=ts.map(t=>inv((t.o+0.05)/100));const g=ts.map(t=>t.g);
 const n=ts.length,mz=z.reduce((a,b)=>a+b)/n,mg=g.reduce((a,b)=>a+b)/n;let sxy=0,sxx=0;z.forEach((v,i)=>{sxy+=(v-mz)*(g[i]-mg);sxx+=(v-mz)**2;});
 const sig=n>2?sxy/sxx:null;out.push(P+' n='+n+(sig?' sigma='+sig.toFixed(3)+' mu='+(mg-sig*mz).toFixed(3):' mean z='+mz.toFixed(3)+' mean g='+mg.toFixed(3)));});
return out.join('\n');}

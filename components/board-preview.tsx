import {characterFor,COLORS} from '@/lib/board';
export default function BoardPreview({grid,label}:{grid:number[][];label?:string}){
 return <div className="board-frame" role="img" aria-label={label||grid.map(r=>r.map(characterFor).join('')).join('. ')}><div className="flap-grid">{grid.flat().map((code,i)=><span className={`flap ${code>=63?'color-flap':''}`} key={i} style={code>=63?{background:COLORS.find(c=>c.code===(code===71?69:code))?.hex,color:'transparent'}:undefined}><span>{characterFor(code)}</span></span>)}</div></div>;
}

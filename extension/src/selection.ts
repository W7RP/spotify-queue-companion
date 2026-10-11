export interface SelectionDiagnostics {
  kind:'discovery'|'sources'|'history';
  candidates:number;
  proposed:number;
  unmatched:number;
  duplicates:number;
  previous:number;
}

export function shortfallReason(selected:number,requested:number,report:SelectionDiagnostics):string {
  if(selected>=requested)return '';
  if(report.kind==='history')return `Only ${selected} songs were available in this history.`;
  if(report.kind==='sources')return `Only ${selected} matches were selected from the ${report.candidates} source songs checked.`;
  const reasons:string[]=[];
  if(report.proposed<requested)reasons.push(`The model returned ${report.proposed} choices`);
  if(report.unmatched)reasons.push(`${report.unmatched} suggested ${report.unmatched===1?'song could':'songs could'} not be matched on Spotify`);
  if(report.duplicates)reasons.push(`${report.duplicates} duplicate ${report.duplicates===1?'match was':'matches were'} skipped`);
  if(report.previous)reasons.push(`${report.previous} ${report.previous===1?'song was':'songs were'} already in the previous selection`);
  return reasons.length?reasons.join('; ')+'.':`Only ${selected} matching songs were found.`;
}

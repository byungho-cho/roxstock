/** API IDs are unsigned BIGINT strings; compare without Number precision loss. */
export function latestBuy<T extends {id:string;boughtAt:string}>(rows:readonly T[]):T|undefined {
  return rows.reduce<T|undefined>((latest,row)=> {
    if(!latest)return row;
    const difference=Date.parse(row.boughtAt)-Date.parse(latest.boughtAt);
    const newerId=/^\d+$/.test(row.id)&&/^\d+$/.test(latest.id)
      ? BigInt(row.id)>BigInt(latest.id) : row.id.localeCompare(latest.id)>0;
    return difference>0||difference===0&&newerId?row:latest;
  },undefined);
}

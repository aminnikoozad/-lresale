import { createPublicClient } from '@/lib/supabase/public';
export type PilotSettings={enabled:boolean;categories:string[];item_cap:number;pickup_days:number[];duration_weeks:number;started_at:string|null};
export const PILOT_DEFAULTS:PilotSettings={enabled:true,categories:['women'],item_cap:30,pickup_days:[6],duration_weeks:8,started_at:null};
export async function loadPilot():Promise<PilotSettings>{
 const {data,error}=await createPublicClient().from('pilot_settings').select('enabled,categories,item_cap,pickup_days,duration_weeks,started_at').eq('id',true).single();
 if(error)console.error('[pilot] settings unavailable',error.code);
 return data??PILOT_DEFAULTS;
}
export function pickupDayAllowed(date:string,pilot:PilotSettings){
 const day=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'America/Toronto'}).format(new Date(date));
 return !pilot.enabled||pilot.pickup_days.includes(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(day));
}

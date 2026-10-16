"use client";
import {useEffect} from "react";
import {recordBuyerEvent,type BrowseEvent} from "@/lib/buyer-analytics";
export function BuyerViewEvent({name,ids}:{name:BrowseEvent;ids:string[]}){const key=ids.join(",");useEffect(()=>{void recordBuyerEvent(name,key.split(","),key);},[name,key]);return null;}

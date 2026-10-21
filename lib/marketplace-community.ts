import 'server-only';
import {marketplaceActor} from './marketplace-media';
import {stagingCommunity} from './neon-staging';
import {communityRpcDefinitions,type CommunityRpc} from './marketplace-community-types';
export async function communityRpc(name:CommunityRpc,args:Record<string,unknown>) {
 if(!Object.hasOwn(communityRpcDefinitions,name))throw new Error('Unknown action');
 if(Object.keys(args).some(k=>!communityRpcDefinitions[name].some(d=>d[0]===k))) throw new Error('Unsupported field');
 const actor=await marketplaceActor();
 if(actor.actor)return stagingCommunity(actor.actor,name,args);
 const {data,error}=await actor.client!.rpc(name,args);if(error)throw new Error(error.message);return data;
}

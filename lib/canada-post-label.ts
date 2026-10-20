// @ts-expect-error Node's built-in test runner requires explicit TypeScript extensions.
import { mailingScenario, SERVICES } from './canada-post.ts';
// @ts-expect-error Node's built-in test runner requires explicit TypeScript extensions.
import { postalCode, validPostal, type Parcel } from './postal.ts';

const ROOT = 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs';
export type Address = { addressLine1: string; addressLine2?: string; city: string; provState: string; countryCode: 'CA'; postalZipCode: string };
export type Sender = { company: string; contactPhone: string; addressDetails: Address };
export type LabelCredentials = { clientId: string; clientSecret: string; customerNumber: string; contractId?: string };
export type LabelInput = { requestId: string; serviceCode: string; sender: Sender; destination: { name: string; addressDetails: Address }; parcel: Parcel; mailingDate: string; payment: 'CreditCard' | 'Account' };
export function validateAddress(address: Address) {
  if (!address || address.countryCode !== 'CA' || !validPostal(address.postalZipCode) ||
    !/^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/.test(address.provState) ||
    typeof address.addressLine1 !== 'string' || !address.addressLine1.trim() || address.addressLine1.length > 44 ||
    (address.addressLine2 != null && (typeof address.addressLine2 !== 'string' || address.addressLine2.length > 44)) ||
    typeof address.city !== 'string' || !address.city.trim() || address.city.length > 40) throw new Error('Check the Canadian mailing address (street lines: 44 characters maximum).');
}
export function labelRequest(input: LabelInput, credentials: LabelCredentials) {
  validateAddress(input.sender.addressDetails); validateAddress(input.destination.addressDetails);
  if (!/^[a-zA-Z0-9]{1,35}$/.test(input.requestId) || !SERVICES.includes(input.serviceCode) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.mailingDate) || !/^\d{7,10}$/.test(credentials.customerNumber) ||
    !input.sender.company?.trim() || input.sender.company.length > 44 || !/^[\d ()+.-]{10,25}$/.test(input.sender.contactPhone) ||
    !input.destination.name?.trim() || input.destination.name.length > 44 ||
    !['CreditCard','Account'].includes(input.payment) || (input.payment === 'Account' && !credentials.contractId)) throw new Error('Incomplete Canada Post shipping configuration.');
  const scenario = mailingScenario(input.parcel, input.sender.addressDetails.postalZipCode, input.destination.addressDetails.postalZipCode, credentials);
  return { customerRequestId: input.requestId, transmitShipment: true, requestedShippingPoint: postalCode(input.sender.addressDetails.postalZipCode), expectedMailingDate: input.mailingDate, providePricingInfo: true,
    deliverySpec: { serviceCode: input.serviceCode, sender: input.sender, destination: input.destination,
      parcelCharacteristics: scenario.parcelCharacteristics, printPreferences: { outputFormat: '8.5x11', encoding: 'PDF' },
      preferences: { showPackingInstructions: true, showPostageRate: false, showInsuredValue: false },
      settlementInfo: { paidByCustomer: credentials.customerNumber, ...(credentials.contractId ? {contractId: credentials.contractId} : {}), intendedMethodOfPayment: input.payment } } };
}
export function artifactUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== 'https://api.canadapost-postescanada.ca' || url.username || url.password || url.search || url.hash ||
    !/^\/prod\/devportal-portaildesdeveloppeurs\/shipping\/v1\/artifacts\/[A-Za-z0-9-]+\/shipping\/[A-Za-z0-9-]+\/\d+$/.test(url.pathname)) throw new Error('Invalid label artifact');
  return url.href;
}
async function token(credentials: LabelCredentials, fetcher: typeof fetch) {
  const response = await fetcher(`${ROOT}/cpc-api-native-oauth-provider/oauth2/token`, {method:'POST', headers:{'X-IBM-Client-Id':credentials.clientId,'X-IBM-Client-Secret':credentials.clientSecret,'Content-Type':'application/x-www-form-urlencoded'},body:'scope=merchant&grant_type=client_credentials', cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Canada Post authentication failed.');
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 10000) throw new Error('Invalid carrier token');
  return data.access_token as string;
}
export async function createLabel(input: LabelInput, credentials: LabelCredentials, fetcher: typeof fetch = fetch) {
  const body = labelRequest(input,credentials);
  const access = await token(credentials,fetcher);
  // Never automatically retry a purchase, including timeouts or malformed success responses.
  const response = await fetcher(`${ROOT}/shipping/v1/${credentials.customerNumber}/${credentials.customerNumber}/shipments`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('Shipment result requires review in Canada Post.');
  const raw = await response.text();
  if (raw.length > 150000) throw new Error('Invalid shipment response');
  const data = JSON.parse(raw);
  const link = Array.isArray(data.links) ? data.links.find((l: {rel?:string}) => l.rel === 'label') : null;
  if (typeof data.shipmentId !== 'string' || !/^[A-Za-z0-9-]{1,32}$/.test(data.shipmentId) || !/^\d{8,35}$/.test(data.trackingPin) || !link || link.mediaType !== 'application/pdf') throw new Error('Shipment result requires review in Canada Post.');
  const rawDue=data.shipmentPrice?.dueAmount;
  if ((typeof rawDue!=='string' && typeof rawDue!=='number') || !/^\d{1,5}(\.\d{1,2})?$/.test(String(rawDue))) throw new Error('Invalid shipment price');
  const due = Number(rawDue);
  if (!Number.isFinite(due) || due < 0 || due > 99999) throw new Error('Invalid shipment price');
  return { shipmentId: data.shipmentId as string, tracking: data.trackingPin as string, artifact: artifactUrl(link.href), chargedCents: Math.round(due*100) };
}
export async function downloadLabel(url: string, credentials: LabelCredentials, fetcher: typeof fetch = fetch) {
  const safeUrl = artifactUrl(url);
  const access = await token(credentials,fetcher);
  const response = await fetcher(safeUrl,{headers:{Authorization:`Bearer ${access}`,Accept:'application/pdf'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/pdf')) throw new Error('Label unavailable');
  // Bound the stream before buffering an untrusted carrier response.
  const reader=response.body?.getReader(); if (!reader) throw new Error('Label unavailable');
  const chunks: Uint8Array[]=[]; let size=0;
  try { for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>5000000) throw new Error('Label too large'); chunks.push(value); } } finally { await reader.cancel(); }
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') throw new Error('Invalid label PDF');
  return bytes;
}

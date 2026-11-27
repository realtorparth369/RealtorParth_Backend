// utils/docLinks.js

export const getDocumentLink = (docKey, partyId) => {
  const base = "https://realtorparth.ca/party";

  const map = {
    fintrac: `${base}/fintrac/${partyId}`,
    pep: `${base}/politically-exposed/${partyId}`,
    crg: `${base}/crg/${partyId}`,

    EBRADA: `${base}/forms/EBRADA/${partyId}`,
    EBRAA: `${base}/forms/EBRAA/${partyId}`,
    EBRATDA: `${base}/forms/EBRATDA/${partyId}`,
    RPC: `${base}/forms/RPC/${partyId}`,

    SCSAAFA: `${base}/forms/SCSAAFA/${partyId}`,
    ESRAA: `${base}/forms/ESRAA/${partyId}`,
    IDMMGOL: `${base}/forms/IDMMGOL/${partyId}`
  };

  return map[docKey] || base;
};
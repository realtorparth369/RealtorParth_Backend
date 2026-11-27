export function getESRAAStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.sellerPrint1) {
        const recipient = getRecipient(doc.sellerSignatureEmail1);

        signers.push({
            role: "Seller 1",
            signed: doc.seller1Signed,
            email: doc.sellerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerPrint2) {
        const recipient = getRecipient(doc.sellerSignatureEmail2);

        signers.push({
            role: "Seller 2",
            signed: doc.seller2Signed,
            email: doc.sellerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint1) {
        const recipient = getRecipient(doc.witnessEmail1);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint2) {
        const recipient = getRecipient(doc.witnessEmail2);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.repPrintName) {
        const recipient = getRecipient(doc.brokerEmail);

        signers.push({
            role: "Broker",
            signed: doc.brokerSigned,
            email: doc.brokerEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getSCSAAFAStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.sellerPrint1) {
        const recipient = getRecipient(doc.sellerSignatureEmail1);

        signers.push({
            role: "Seller 1",
            signed: doc.seller1Signed,
            email: doc.sellerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerPrint2) {
        const recipient = getRecipient(doc.sellerSignatureEmail2);

        signers.push({
            role: "Seller 2",
            signed: doc.seller2Signed,
            email: doc.sellerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint1) {
        const recipient = getRecipient(doc.witnessEmail1);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint2) {
        const recipient = getRecipient(doc.witnessEmail2);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.repPrintName) {
        const recipient = getRecipient(doc.repSignatureEmail);

        signers.push({
            role: "Broker",
            signed: doc.brokerSigned,
            email: doc.repSignatureEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.spouseName) {
        const recipient = getRecipient(doc.spouseSignatureEmail);

        signers.push({
            role: "Spouse",
            signed: doc.spouseSigned,
            email: doc.spouseSignatureEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.spouseWitnessName) {
        const recipient = getRecipient(doc.spouseWitnessEmail);

        signers.push({
            role: "Spouse Witness",
            signed: doc.spouseWitnessSigned,
            email: doc.spouseWitnessEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getIDMMGOLStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.sellerPrint1) {
        const recipient = getRecipient(doc.sellerSignatureEmail1);

        signers.push({
            role: "Seller 1",
            signed: doc.seller1Signed,
            email: doc.sellerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerPrint2) {
        const recipient = getRecipient(doc.sellerSignatureEmail2);

        signers.push({
            role: "Seller 2",
            signed: doc.seller2Signed,
            email: doc.sellerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witness1) {
        const recipient = getRecipient(doc.witnessEmail1);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witness2) {
        const recipient = getRecipient(doc.witnessEmail2);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.repPrintName) {
        const recipient = getRecipient(doc.brokerEmail);

        signers.push({
            role: "Broker",
            signed: doc.brokerSigned,
            email: doc.brokerEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getRPCStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.buyerName1) {
        const recipient = getRecipient(doc.buyerSignatureEmail1);

        signers.push({
            role: "Buyer 1",
            signed: doc.buyer1Signed,
            email: doc.buyerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyerName2) {
        const recipient = getRecipient(doc.buyerSignatureEmail2);

        signers.push({
            role: "Buyer 2",
            signed: doc.buyer2Signed,
            email: doc.buyerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyerWitnessName1) {
        const recipient = getRecipient(doc.buyerWitnessEmail1);

        signers.push({
            role: "Buyer Witness 1",
            signed: doc.buyerWitness1Signed,
            email: doc.buyerWitnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyerWitnessName2) {
        const recipient = getRecipient(doc.buyerWitnessEmail2);

        signers.push({
            role: "Buyer Witness 2",
            signed: doc.buyerWitness2Signed,
            email: doc.buyerWitnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerName1) {
        const recipient = getRecipient(doc.sellerSignatureEmail1);

        signers.push({
            role: "Seller 1",
            signed: doc.seller1Signed,
            email: doc.sellerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerName2) {
        const recipient = getRecipient(doc.sellerSignatureEmail2);

        signers.push({
            role: "Seller 2",
            signed: doc.seller2Signed,
            email: doc.sellerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerWitnessName1) {
        const recipient = getRecipient(doc.sellerWitnessEmail1);

        signers.push({
            role: "Seller Witness 1",
            signed: doc.sellerWitness1Signed,
            email: doc.sellerWitnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.sellerWitnessName2) {
        const recipient = getRecipient(doc.sellerWitnessEmail2);

        signers.push({
            role: "Seller Witness 2",
            signed: doc.sellerWitness2Signed,
            email: doc.sellerWitnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.spouseName) {
        const recipient = getRecipient(doc.spouseSignatureEmail);

        signers.push({
            role: "Spouse",
            signed: doc.spouseSigned,
            email: doc.spouseSignatureEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.spouseWitnessName) {
        const recipient = getRecipient(doc.spouseWitnessEmail);

        signers.push({
            role: "Spouse Witness",
            signed: doc.spouseWitnessSigned,
            email: doc.spouseWitnessEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getEBRADAStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.buyersig1) {
        const recipient = getRecipient(doc.buyerSignatureEmail1);

        signers.push({
            role: "Buyer 1",
            signed: doc.buyer1Signed,
            email: doc.buyerSignatureEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyersig2) {
        const recipient = getRecipient(doc.buyerSignatureEmail2);

        signers.push({
            role: "Buyer 2",
            signed: doc.buyer2Signed,
            email: doc.buyerSignatureEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witness1sig) {
        const recipient = getRecipient(doc.witness1Email);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witness1Email,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witness2sig) {
        const recipient = getRecipient(doc.witness2Email);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witness2Email,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.agentsig) {
        const recipient = getRecipient(doc.agentEmail);

        signers.push({
            role: "Agent",
            signed: doc.agentSigned,
            email: doc.agentEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getEBRAAStatus(doc) {
    if (!doc) return null;

    console.log("doc.signers:", doc.signers);
    console.log("buyerEmail1:", doc.buyerEmail1);

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.buyerPrint1) {
        const recipient = getRecipient(doc.buyerEmail1);

        signers.push({
            role: "Buyer 1",
            signed: doc.buyer1Signed,
            email: doc.buyerEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyerPrint2) {
        const recipient = getRecipient(doc.buyerEmail2);

        signers.push({
            role: "Buyer 2",
            signed: doc.buyer2Signed,
            email: doc.buyerEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint1) {
        const recipient = getRecipient(doc.witnessEmail1);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint2) {
        const recipient = getRecipient(doc.witnessEmail2);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.repPrintName) {
        const recipient = getRecipient(doc.repEmail);

        signers.push({
            role: "Broker",
            signed: doc.repSigned,
            email: doc.repEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getEBRATDAStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.buyerPrint1) {
        const recipient = getRecipient(doc.buyerEmail1);

        signers.push({
            role: "Buyer 1",
            signed: doc.buyer1Signed,
            email: doc.buyerEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.buyerPrint2) {
        const recipient = getRecipient(doc.buyerEmail2);

        signers.push({
            role: "Buyer 2",
            signed: doc.buyer2Signed,
            email: doc.buyerEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint1) {
        const recipient = getRecipient(doc.witnessEmail1);

        signers.push({
            role: "Witness 1",
            signed: doc.witness1Signed,
            email: doc.witnessEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.witnessPrint2) {
        const recipient = getRecipient(doc.witnessEmail2);

        signers.push({
            role: "Witness 2",
            signed: doc.witness2Signed,
            email: doc.witnessEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.brokerPrint) {
        const recipient = getRecipient(doc.brokerEmail);

        signers.push({
            role: "Broker",
            signed: doc.brokerSigned,
            email: doc.brokerEmail,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}


export function getCRGStatus(doc) {
    if (!doc) return null;

    const signers = [];

    const getRecipient = (email) =>
        doc.signers?.find(
            s => s.email?.toLowerCase() === email?.toLowerCase()
        );

    if (doc.consumerPrintName1) {
        const recipient = getRecipient(doc.consumerEmail1);

        signers.push({
            role: "Consumer 1",
            signed: doc.consumer1Signed,
            email: doc.consumerEmail1,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    if (doc.consumerPrintName2) {
        const recipient = getRecipient(doc.consumerEmail2);

        signers.push({
            role: "Consumer 2",
            signed: doc.consumer2Signed,
            email: doc.consumerEmail2,
            name: recipient?.name,
            recipientId: recipient?.recipientId,
            routingOrder: recipient?.routingOrder,
            clientUserId: recipient?.clientUserId
        });
    }

    const completed = signers.filter(s => s.signed).length;

    return {
        total: signers.length,
        completed,
        allSigned:
            signers.length > 0 &&
            completed === signers.length,
        signers
    };
}
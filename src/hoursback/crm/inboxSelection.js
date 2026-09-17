const normalize = (value) => String(value || '').trim().toLowerCase();

function businessInboxAddress(prospect) {
  return normalize(prospect && (prospect.emailManualValue || prospect.email));
}

function selectedPersonAddresses(prospect) {
  return (prospect && prospect.contacts || [])
    .filter((person) => person.isPrimary && person.email
      && !person.bouncedAt && !person.setAsideAt)
    .map((person) => normalize(person.email));
}

function selectedInboxAddress(prospect) {
  const inbox = businessInboxAddress(prospect);
  return prospect && prospect.emailInboxSelected && inbox
    && !selectedPersonAddresses(prospect).includes(inbox) ? inbox : '';
}

function hasSelectedRecipient(prospect) {
  return selectedPersonAddresses(prospect).length > 0 || Boolean(selectedInboxAddress(prospect));
}

module.exports = { normalize, businessInboxAddress, selectedPersonAddresses,
  selectedInboxAddress, hasSelectedRecipient };

// Business names read by hand, one at a time, 2026-08-28.
//
// 161 of 696 emailable businesses had something in the name field that was not
// a name: a Google search heading ("Custom Home Builder in Sisters, Oregon"),
// a tagline glued on after a dash, a domain, or nothing usable at all.
//
// Every entry below was settled by reading that business's own home page text
// — the sentence they wrote about themselves — not by a rule. The rule
// attempts produced "Northlamontass" and "Rookerfamilydentistry", and a rule
// is what put a search phrase in the name field in the first place.
//
// Keyed by domain because a domain is readable and an id is not.
//
// Where their own page named them something different from the domain, THEIR
// NAME WINS: bendanimalclinic.com is Brookswood Animal Hospital, and
// bendinsuranceagency.com is Steve Thill at AIC Insurance.
const BY_DOMAIN = {
  'gentledental.interdent.com': 'Gentle Dental',
  '9gkexcavation.com': '9GK Construction and Excavation',
  'lumosmedicalcenter.com': 'Lumos Medical Center',
  'a1storagemadras.com': 'A-1 Self Storage',
  'lapineministorage.com': 'Encompass Storage of La Pine',
  'alonsosconstruction.com': "Alonso's General Construction",
  'alpineoutfitters.net': 'Alpine Outfitters',
  'bendanimalclinic.com': 'Brookswood Animal Hospital',
  'limitlessautobody.com': 'Limitless Auto Body',
  'autobodyconcepts.com': 'Auto Body Concepts',
  'godsgreasemonkeyor.com': 'Gods Grease Monkey',
  'barsevena.com': 'Bar Seven A',
  'bendanimaler.com': 'Bend Animal Emergency',
  'bendbiomedical.org': 'Bend Biomedical',
  'bendupmetal.com': 'Bendup Metal',
  'einsteinpros.com': 'Einstein Pros',
  'olinsitzexcavation.com': 'Olin Sitz Excavation',
  'morisettemfg.com': 'Morisette Manufacturing',
  'lifedesignbuild.us': 'Life Design Build',
  'eastbendvet.com': 'East Bend Animal Hospital',
  'pinehurstmanagement.com': 'Pinehurst Management',
  'ridgeviewvetclinic.com': 'Ridgeview Veterinary Clinic',
  'bendvets.com': 'Westside Pet Hospital',
  'blueelephantstorage.com': 'Blue Elephant Storage',
  'brightservices.com': 'Bright Services',
  'btlliners.com': 'BTL Liners',
  'oliverinsurance.net': 'Oliver Insurance',
  'cascadiamgmt.com': 'Cascadia Management',
  'northzoneconstructionllc.com': 'North Zone Construction',
  'whhsmaf.com': 'SMAF Construction',
  'sunriseoregon.com': 'Sunrise Construction',
  'kaufmanhomesinc.com': 'Kaufman Homes',
  'sisterscustomhomes.com': 'Sisters Custom Homes',
  'reinhardt-homes.com': 'Reinhardt Homes',
  'welbuilthomes.com': 'WELBuilt Homes',
  'newerahomes.com': 'New Era Homes',
  'structuredevelopmentnw.com': 'Structure Development NW',
  'forgeprousa.com': 'Longhorn Fabrication',
  'simfab.co': 'SimFab',
  'dentistinredmond.com': 'Blue Sky Family Dentistry',
  'derm-health.com': 'Dermatology Health Specialists',
  'thornpropertymanagement.com': 'Thorn Property Management',
  'deschutespetlodge.com': 'Deschutes Pet Lodge',
  'chetselectric.com': "Chet's Electric",
  'chucksautoshopinc.com': "Chuck's Auto Shop",
  'elitemotorcarsbend.com': 'Elite Motorcars',
  'deschutesadvancedelectric.com': 'Deschutes Advanced Electric',
  'thefinanciallab.com': 'The Financial Lab',
  'fixbend.org': 'FIXbend',
  'midstateconstructionservices.com': 'Midstate Construction Services',
  'haabyandassociates.com': 'Haaby & Associates',
  'mgmlawfirm.net': 'MGM Law Firm',
  'proheat.org': 'Professional Heating & Cooling',
  'bendlifestylesrentals.com': 'Lifestyles Realty Group',
  'cobaltpropertiesgroup.com': 'Cobalt Properties Group',
  'crookcountyproperties.com': 'Crook County Properties',
  'desertpineproperties.com': 'Desert Pine Properties',
  'westerntitle.com': 'Western Title',
  'prcco.org': 'Redmond Pregnancy Resource Center',
  'redmondschools.org': 'Redmond School District 2J',
  'aicinsagency.com': 'AIC Insurance',
  'bendinsuranceagency.com': 'AIC Insurance',
  'graybealgroup.com': 'Graybeal Group',
  'deschutesplumbing.com': 'Deschutes Plumbing',
  'dnlogistic.com': 'Distribution Network',
  'family1stbr.com': 'Family 1st Building & Remodeling',
  'habitatlapinesunriver.org': 'Habitat for Humanity La Pine Sunriver',
  'goschock.com': 'Schock Logistics',
  'sky-highstorage.com': 'Sky-High Storage',
  'storewithtps.com': 'Thompson Premier Storage',
  'aaalapineministorage.com': 'La Pine Storage',
  'sendtrans.com': 'SEND Transportation',
  'seranbio.com': 'Serán Bioscience',
  'theshedcenter.com': 'The Shed Center',
  'sistershatsandco.com': 'Sisters Hats + Co.',
  'allstarlabor.com': 'All Star Labor',
  'stonefirebuilders.com': 'Stone Fire Construction',
  'storageinoregon.com': 'Storage In Oregon',
  'outbuilders.com': 'Outbuilders',
  'newberryselfstorage.com': 'Newberry Self Storage',
  'madrasministorage.com': 'Madras Mini Storage',
  'superiorsanitationoregon.com': 'Superior Sanitation',
  'tenpointcpa.com': 'TenPoint CPA',
  '3rdstreetbeverage.com': '3rd Street Beverage',
  'americanpridetransmission.com': 'TorqueFix Diesel',
  'truthautomotivesllc.my.canva.site': 'Truth Automotives',
  'viking-pm.com': 'Viking Property Management',
  'vlslandscapesolutions.com': 'VLS Landscape Solutions',
  'keithwalkingfloor.com': 'KEITH Manufacturing',
  'abwholesaler.com': 'Western Beverage',
  'cbarldevelopment.com': 'C Bar L Development',
  'jrcpa.com': 'Jones & Roth',
};

// Read by hand and still not settled. Their own page never says a name, so the
// only candidate comes off the domain — which is the guess that produced
// "Northlamontass". These are held back rather than sent to a stranger under a
// name nobody confirmed.
const STILL_UNKNOWN = {
  'guaranteecleaning.com': 'page never names them; domain suggests Guarantee Cleaning',
  'cncmsinc.com': 'page is an address block only',
  'coent.com': 'page says "ENT and Audiology Services"; domain suggests Central Oregon ENT',
  'ccblookup.com': 'this is a state licence lookup, not their own site',
  'ga-rogers.com': 'domain suggests GA Rogers; exact styling unconfirmed',
  'accuairheat.com': 'domain suggests AccuAir; exact styling unconfirmed',
  'rizktc.com': 'domain suggests Rizk Truck Center; unconfirmed',
  'south-sister.com': 'domain suggests South Sister Property Management; unconfirmed',
  'redmondcompanies.com': 'page is empty; domain suggests Redmond Companies',
  'performanceauthoritybend.com': 'domain suggests Performance Authority; unconfirmed',
  'funkewerks.com': 'domain suggests Funkewerks; unconfirmed',
  'arkminiatures.net': 'domain suggests Ark Miniatures; unconfirmed',
  'dcrnorthwest.com': 'domain suggests DCR Northwest; unconfirmed',
};

// National chains and franchise branches that reached the list through their
// local branch page. A cold email about finding hours in their week goes to a
// corporate inbox and reads as a mailing list. Held back.
const NOT_A_LOCAL_BUSINESS = [
  'aerotek.com', 'bbklaw.com', 'clearybuilding.com', 'coldwellbanker.com',
  'gillspointstire.com', 'estes-express.com', 'farmstore.com', 'acehardware.com',
  'aspendental.com', 'peopleready.com', 'pridestaff.com', 'interimhealthcare.com',
  'utopiamanagement.com', 'theupsstore.com', 'odfl.com', 'bnsf.com',
  'chevronwithtechron.com', 'ferguson.com', 'mutualmaterials.com', 'acmetool.com',
  'wafdbank.com', 'oregon.aaa.com', 'agriculture.papemachinery.com',
  'srsdistribution.com', 'century21northhomes.com', 'windermere.com',
  'bankerslife.com', 'selco.org', 'worksourceoregon.org', 'ibew280.org',
];

function domainOf(url) {
  return String(url || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

// The corrected name, or null if none was settled.
function correctedName(url) {
  return BY_DOMAIN[domainOf(url)] || null;
}

function whyStillUnknown(url) {
  return STILL_UNKNOWN[domainOf(url)] || null;
}

function isNotLocal(url) {
  const d = domainOf(url);
  return NOT_A_LOCAL_BUSINESS.some((n) => d === n || d.endsWith('.' + n));
}

module.exports = {
  BY_DOMAIN, STILL_UNKNOWN, NOT_A_LOCAL_BUSINESS,
  domainOf, correctedName, whyStillUnknown, isNotLocal,
};

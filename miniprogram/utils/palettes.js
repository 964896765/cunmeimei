'use strict';
// Shared by runtime and asset builders. Stable keys preserve existing preferences.
// Pearl Sunset uses coral button surfaces and darker accents for readable small controls.
const palettes = {
 prism: {
   "brand": "#875D55",
   "action": "#EFCBC2",
   "link": "#76524C",
   "background": "#FAF8F6",
   "surface": "#FFFFFF",
   "soft": "#F8EAE5",
   "soft-alt": "#F2E7EB",
   "ink": "#302D33",
   "text": "#49434B",
   "muted": "#655C65",
   "border": "#E9E6E2",
   "control-border": "#95878D",
   "on-action": "#332D31",
   "danger": "#973F4F",
   "danger-soft": "#F8EAE5",
   "price": "#704D47",
   "glow-start": "#F8EAE5",
   "glow-rose": "#F2E7EB",
   "glow": "#E9E5EF"
 },
 dark: {brand:'#C9B8FF',action:'#C9B8FF',link:'#C9B8FF',background:'#191A2B',surface:'#25263A',soft:'#302D49','soft-alt':'#302D49',ink:'#F0EDFF',text:'#DED9EB',muted:'#BBB6CF',border:'#4C485F','control-border':'#8D87A0','on-action':'#191A2B',danger:'#FFB4AA','danger-soft':'#432F39',price:'#DED9EB','glow-start':'#302D49','glow-rose':'#302D49',glow:'#302D49'},
 clear: {brand:'#243955',action:'#243955',link:'#243955',background:'#FFFFFF',surface:'#FFFFFF',soft:'#EAF0F6','soft-alt':'#EAF0F6',ink:'#18283A',text:'#243955',muted:'#39495E',border:'#6E7784','control-border':'#6E7784','on-action':'#FFFFFF',danger:'#92312E','danger-soft':'#FCEDEB',price:'#243955','glow-start':'#EAF0F6','glow-rose':'#EAF0F6',glow:'#EAF0F6'},
 quiet: {brand:'#555B61',action:'#555B61',link:'#555B61',background:'#EAE9E7',surface:'#F8F7F5',soft:'#DFDEDB','soft-alt':'#DFDEDB',ink:'#303238',text:'#41454B',muted:'#5A5E62',border:'#C9C8C4','control-border':'#7F8185','on-action':'#FFFFFF',danger:'#923B38','danger-soft':'#F2E5E2',price:'#41454B','glow-start':'#DFDEDB','glow-rose':'#DFDEDB',glow:'#EAE9E7'},
 warm: {brand:'#B87887',action:'#8F5263',link:'#8F5263',background:'#FFF8F4',surface:'#FFFFFF',soft:'#F5E7EB','soft-alt':'#F5E7EB',ink:'#3E3037',text:'#57424D',muted:'#745B65',border:'#DDC9CE','control-border':'#A0848E','on-action':'#FFFFFF',danger:'#9D3534','danger-soft':'#FCEDEB',price:'#57424D','glow-start':'#F5E7EB','glow-rose':'#F5E7EB',glow:'#FFF1E4'},
 gentle: {brand:'#487E6C',action:'#386B59',link:'#386B59',background:'#F1F8F4',surface:'#FFFFFF',soft:'#E2EEE7','soft-alt':'#E2EEE7',ink:'#243A31',text:'#365246',muted:'#4E6258',border:'#CCDCD3','control-border':'#7A9084','on-action':'#FFFFFF',danger:'#9A3735','danger-soft':'#FCEDEB',price:'#365246','glow-start':'#E2EEE7','glow-rose':'#E2EEE7',glow:'#ECF4E9'}
};
// Surface gradients remain static, with solid, readable form surfaces.
for (const [name, c] of Object.entries(palettes)) {
 c['action-end'] = name === 'prism' ? '#EFCBC2' : c.action;
 c['wash-rose'] = name === 'prism' ? '#F8EAE5' : c.background;
 c['wash-blue'] = name === 'prism' ? '#F2E7EB' : c.background;
 c['wash-lilac'] = name === 'prism' ? '#E9E5EF' : c.background;
}
// Page accents are presentation only; the user's six saved theme choices remain stable.
const families = {
  "home": {},
  "discover": {
    "soft": "#F2E7EB",
    "soft-alt": "#E9E5EF"
  },
  "publish": {
    "soft": "#F8EAE5",
    "soft-alt": "#FAF8F6"
  },
  "messages": {
    "soft": "#F2E7EB",
    "soft-alt": "#FAF8F6"
  },
  "me": {
    "soft": "#E9E5EF",
    "soft-alt": "#F2E7EB"
  }
};
// Each actual route has its own three-color mix, within five shared accent families.
const pageProfiles = {
  "home": {
    "family": "home",
    "mix": [
      "#F8EAE5",
      "#F2E7EB",
      "#E9E5EF"
    ]
  },
  "discover": {
    "family": "discover",
    "mix": [
      "#FAF8F6",
      "#E9E5EF",
      "#F2E7EB"
    ]
  },
  "publish": {
    "family": "publish",
    "mix": [
      "#F8EAE5",
      "#FAF8F6",
      "#F2E7EB"
    ]
  },
  "messages": {
    "family": "messages",
    "mix": [
      "#E9E5EF",
      "#F2E7EB",
      "#FAF8F6"
    ]
  },
  "me": {
    "family": "me",
    "mix": [
      "#F2E7EB",
      "#F8EAE5",
      "#E9E5EF"
    ]
  },
  "regions": {
    "family": "discover",
    "mix": [
      "#FAF8F6",
      "#F8EAE5",
      "#E9E5EF"
    ]
  },
  "detail": {
    "family": "home",
    "mix": [
      "#F8EAE5",
      "#E9E5EF",
      "#FAF8F6"
    ]
  },
  "booking": {
    "family": "discover",
    "mix": [
      "#F2E7EB",
      "#FAF8F6",
      "#F8EAE5"
    ]
  },
  "my-posts": {
    "family": "home",
    "mix": [
      "#FAF8F6",
      "#F2E7EB",
      "#E9E5EF"
    ]
  },
  "my-bookings": {
    "family": "me",
    "mix": [
      "#E9E5EF",
      "#FAF8F6",
      "#F8EAE5"
    ]
  },
  "merchant": {
    "family": "publish",
    "mix": [
      "#F8EAE5",
      "#F2E7EB",
      "#FAF8F6"
    ]
  },
  "chat": {
    "family": "messages",
    "mix": [
      "#F2E7EB",
      "#E9E5EF",
      "#FAF8F6"
    ]
  },
  "merchant-services": {
    "family": "discover",
    "mix": [
      "#FAF8F6",
      "#E9E5EF",
      "#F8EAE5"
    ]
  },
  "merchant-bookings": {
    "family": "messages",
    "mix": [
      "#E9E5EF",
      "#F8EAE5",
      "#FAF8F6"
    ]
  },
  "merchant-team": {
    "family": "publish",
    "mix": [
      "#F8EAE5",
      "#E9E5EF",
      "#F2E7EB"
    ]
  }
};
function profileFor(route='') { return pageProfiles[String(route).replace(/^\//,'').split('/')[1]] || pageProfiles.home; }
function resolvePalette(theme='prism',route='') {
 const base = palettes[theme] || palettes.prism;
 if (theme !== 'prism') return base;
 const profile = profileFor(route);
 return {...base,...families[profile.family], 'wash-rose':profile.mix[0], 'wash-blue':profile.mix[1], 'wash-lilac':profile.mix[2]};
}
const iconPalettes = {...palettes};
for (const name of Object.keys(families)) iconPalettes['prism-'+name] = resolvePalette('prism','pages/'+name+'/index');
module.exports = {palettes,pageProfiles,profileFor,resolvePalette,iconPalettes};

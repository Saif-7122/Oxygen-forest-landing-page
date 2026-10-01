import os

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<div class="form-ok">Thank you. WhatsApp is opening with your request pre-filled.</div>', '<div class="form-ok">Thank you for your response, our team will get back to you.</div>')
content = content.replace('<div class="form-ok">Thank you. WhatsApp is opening to confirm your visit slot.</div>', '<div class="form-ok">Thank you for your response, our team will get back to you.</div>')

old_js = """    var msg;
    if(source==='popup_visit'){
      msg='Hi, I am '+name+'. Looking for Oxygen Forest details. I want to pre-book a hosted site visit. Slot: '+visit+'. My number: '+code+' '+phone+'.';
    }else{
      msg='Hi, I am '+name+'. Looking for Oxygen Forest details. Purpose: '+purpose+(visit?'. Visit: '+visit:'')+(buyer?'. Buyer: '+buyer:'')+'. My number: '+code+' '+phone+'.';
    }
    window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg+attribSuffix()),'_blank');
    if(source==='popup'||source==='popup_visit')setTimeout(closePopup,2500);"""

new_js = """    if(source==='popup'||source==='popup_visit')setTimeout(closePopup,2500);"""

content = content.replace(old_js, new_js)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

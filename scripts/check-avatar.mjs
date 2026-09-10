// Prueba que UserAvatar dibuje la <img> cuando la persona tiene foto.
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { UserAvatar } from '../src/components/ui/user-avatar.tsx';

const FOTO = 'https://lh3.googleusercontent.com/a/ACg8ocJW0GaOPE-oWuw=s96-c';

const casos = [
  {
    nombre: 'persona con foto de Google',
    person: { id: 'u1', full_name: 'Joel Perrone', email: 'joel@x.com', avatar_url: FOTO },
    espera: 'img',
  },
  {
    nombre: 'persona sin foto cae en iniciales',
    person: { id: 'u2', full_name: 'Ariel Hosid', email: 'ariel@x.com', avatar_url: null },
    espera: 'iniciales',
  },
  {
    nombre: 'sin persona',
    person: undefined,
    espera: 'iniciales',
  },
];

let fallas = 0;

for (const c of casos) {
  const html = renderToStaticMarkup(React.createElement(UserAvatar, { person: c.person }));
  const hayImg = /<img[^>]+src="https:\/\/lh3/.test(html);
  const hayReferrer = /referrerpolicy="no-referrer"/i.test(html);
  const ok = c.espera === 'img' ? hayImg && hayReferrer : !hayImg;

  if (ok) {
    console.log(`OK   ${c.nombre}${c.espera === 'img' ? ' (con referrerPolicy)' : ''}`);
  } else {
    fallas++;
    console.log(`FALLA ${c.nombre}`);
    console.log(`      img=${hayImg} referrerPolicy=${hayReferrer}`);
    console.log(`      ${html.slice(0, 220)}`);
  }
}

process.exit(fallas === 0 ? 0 : 1);

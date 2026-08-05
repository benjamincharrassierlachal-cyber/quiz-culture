# -*- coding: utf-8 -*-
"""Élargit les réponses acceptées des questions à plusieurs bonnes réponses."""
import json, io

AJOUTS = {
 'Quel est le contraire du mot « grand » ?': ['petite', 'minuscule', 'tout petit'],
 'Quel est le contraire du mot « rapide » ?': ['lentement', 'doucement'],
 'Quel est le contraire du mot « chaud » ?': ['froide', 'glacé', 'glacial', 'frais'],
 'Quel est le contraire de « chaud » ?': ['glacé', 'glacial', 'frais', 'froide'],
 'Quel est le contraire du mot « ouvert » ?': ['clos', 'fermée'],
 'Quel est le contraire du mot « propre » ?': ['malpropre', 'crasseux', 'sali'],
 'Quel est le contraire de l’adverbe « souvent » ?': ['jamais', 'peu souvent'],
 "Quel est le contraire de l'adverbe « souvent » ?": ['jamais', 'peu souvent'],
 'Quel est le contraire du mot « haut » ?': ['basse', 'en bas'],
 'Quel est le contraire du mot « devant » ?': ['arrière', 'en arrière', 'au dos'],
 'Quel est le contraire du mot « content » ?': ['mécontent', 'malheureux', 'fâché', 'pas content'],
 'Quel est le contraire du mot « riche » ?': ['démuni', 'miséreux', 'pauvres'],
 'Quel est le contraire du mot « bruyant » ?': ['silencieuse', 'discret'],
 'Quel est le contraire du mot « toujours » ?': ['ne jamais'],
 'Quel mot est un synonyme de « content » ?': ['satisfait', 'gai', 'enchanté'],
 'Quel mot est un synonyme du verbe « débuter » ?': ['entamer', 'amorcer', 'se lancer', 'commencer'],
 'Quelle figure de style dit le contraire de ce que l’on pense pour se moquer ?': ['ironie'],
 "Quelle figure de style dit le contraire de ce que l'on pense pour se moquer ?": ['ironie'],
}

total = 0
for f in ('data/questions.json', 'data/detente.json'):
    d = json.load(io.open(f, encoding='utf-8'))
    for q in d['questions']:
        add = AJOUTS.get(q['prompt'])
        if not add:
            continue
        acc = q.get('accepted', [])
        for a in add:
            if a not in acc:
                acc.append(a)
                total += 1
        q['accepted'] = acc
    io.open(f, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2))
print('%d formes ajoutées' % total)

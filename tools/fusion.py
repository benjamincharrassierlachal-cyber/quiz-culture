# -*- coding: utf-8 -*-
"""Fusionne deux banques BAC sans créer de doublon.

    python3 tools/fusion.py ancienne.json nouvelle.json sortie.json

Règles d'exclusion, appliquées à la seconde banque :
  - énoncé déjà présent dans la première (comparaison souple) ;
  - réponse déjà utilisée dans le même couple classe/matière — sans quoi un joueur
    pourrait devoir donner deux fois la même réponse dans une classe.
Les identifiants de la seconde banque sont renumérotés à la suite, pour ne pas
invalider l'historique « questions déjà vues » stocké sur les appareils.
"""
import json, io, re, sys, collections

def souple(s):
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

src_a, src_b, dest = sys.argv[1], sys.argv[2], sys.argv[3]
A = json.load(io.open(src_a, encoding='utf-8'))
B = json.load(io.open(src_b, encoding='utf-8'))

enonces = {souple(q['prompt']) for q in A['questions']}
reponses = collections.defaultdict(set)
compteur = collections.Counter()
for q in A['questions']:
    reponses[(q['level'], q['subject'])].add(souple(q['answer']))
    compteur[(q['level'], q['subject'])] += 1

prefixe = {}
for q in A['questions']:
    m = re.match(r'^(.*)-(\d+)$', q['id'])
    if m:
        prefixe[(q['level'], q['subject'])] = m.group(1)

gardees, ecartees = [], collections.Counter()
for q in B['questions']:
    cle = (q['level'], q['subject'])
    if souple(q['prompt']) in enonces:
        ecartees['énoncé déjà présent'] += 1
        continue
    if souple(q['answer']) in reponses[cle]:
        ecartees['réponse déjà utilisée dans le pool'] += 1
        continue
    enonces.add(souple(q['prompt']))
    reponses[cle].add(souple(q['answer']))
    compteur[cle] += 1
    q = dict(q)
    q['id'] = '%s-%03d' % (prefixe.get(cle, cle[0]), compteur[cle])
    gardees.append(q)

A['questions'] = A['questions'] + gardees
io.open(dest, 'w', encoding='utf-8').write(json.dumps(A, ensure_ascii=False, indent=2))
print('conservées : %d + %d = %d questions' % (len(A['questions']) - len(gardees), len(gardees), len(A['questions'])))
for k, n in ecartees.most_common():
    print('  écartées — %s : %d' % (k, n))

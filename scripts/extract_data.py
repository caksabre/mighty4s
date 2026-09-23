from pypdf import PdfReader
import re,json,math
from pathlib import Path
import sys
if len(sys.argv)<2:sys.exit('Usage: python3 scripts/extract_data.py path/to/Mighty4s-2007-2015.pdf')
pdf=PdfReader(sys.argv[1])
players={}
for n in range(124,131):
 for line in pdf.pages[n].extract_text(extraction_mode='layout').splitlines():
  m=re.match(r'^\s*(.+?)\s{2,}(20\d\d(?:–\d\d)?)\s{2,}(.+)$',line)
  if not m: continue
  name,years,nums=m.groups();v=nums.split()
  if len(v)!=8: raise ValueError((name,v))
  p=players.setdefault(name,dict(name=name,seasons=years,runs=0,matches=0,average=None,hs='—',wickets=0,best='—',bowlAverage=None))
  if n<128:
   p.update(matches=int(v[0]),innings=int(v[1]),runs=int(v[3]),hs=v[4],average=None if v[5]=='-' else float(v[5]))
  else: p.update(wickets=int(v[3]),best=v[4],bowlAverage=None if v[5]=='-' else float(v[5]))
for p in players.values():
 avg=p['average'] if p['average'] is not None else (p['runs']/max(1,p.get('innings',1)))
 reliability=min(1,p['matches']/20)
 p['bat']=round(min(96,42+min(avg,50)*.68+min(p['runs'],1600)/100+reliability*5))
 p['bowl']=round(min(97,30+min(p['wickets'],100)*.42+(max(0,35-(p['bowlAverage'] or 40))*.65 if p['wickets'] else 0)))
 p['role']='All-rounder' if p['bat']>=65 and p['bowl']>=60 else 'Bowler' if p['bowl']>=57 else 'Batter'
nick={'Pete Croaker':'Pistol','Sean Fegan':'Seanie','Richard Nicoll':'Richie Nic','Brett Booth':'Bootsy','Chris Evans':'Chrissy','Matt Dyke':'Dykie','Usman Mulla':'Uzi','Mark Glazebrook':'Glaze','Gaurav Patil':'G-man','Richard Verity':'Richard Variety','Joseph James':'Joey','Tim Allen':'Timmy','Mike Wilson':'Mikey'}
for p in players.values():p['nickname']=nick.get(p['name'],'')
# Bowling styles from player profiles, pp. 119–124; explicitly label missing styles.
profile_text='\n'.join(pdf.pages[n].extract_text() for n in range(118,124))
aliases={'Joe James':'Joseph James','Timmy Allen':'Tim Allen'}
profiles={}
for m in re.finditer(r'([^\n]+) “[^”]+”\n(.*?)(?=\n[^\n]+ “[^”]+”\n|$)',profile_text,re.S):
 name=aliases.get(m[1],m[1]); style_match=re.search(r'\nBowling\n([^\n]+)',m[2])
 if style_match: profiles[name]=style_match[1]
for p in players.values():
 description=profiles.get(p['name'])
 p['bowlingType']='spin' if description and 'Break' in description else 'seam'
 p['bowlingDescription']=description or 'Seam (game default; style not recorded)'
 p['bowlingVerified']=bool(description)

# Opponents transcribed from the final league tables, PDF pp. 12,15,27,40,49,60,75,89,99.
rows=[
(2007,'1987 League · Division 5','5th',12,['Ealing 3 Bridges',"Barnet B’s 4",'Brentham 4','Osterley 3','Hornsey 4','Indian Gymkhana 4','Swamibapa']),
(2008,'1987 League · Division 5','Champions',15,['Richmond 5','Osterley 3','Hornsey 4','North London 5','MTSSC 5','Birkbeck College 4','Highgate 5','Winchmore Hill 5','Ickenham 4','GWR 4']),
(2009,'1987 League · Division 4','Champions',27,['Shepherds Bush 4','Richmond 5','Crouch End 3','Lohana 3','Twickenham 5','Perivale Phoenicians 4','Brentham 4','GWR 3','Mill Hill Village 4']),
(2010,'1987 League · Division 3','Runners-up',40,["Barnet B’s 4",'Uxbridge 4','Ealing 5','Shepherds Bush 4','Highgate 4','Winchmore Hill 4','Kenton 4','Hanwell 3','Mill Hill Village 3']),
(2011,'1987 League · Division 2','Runners-up',49,['South Hampstead 4','Enfield 3','Birkbeck College 3','Twickenham 4','Acton 4','MTSSC 4','North London 4','Brondesbury 4']),
(2012,'1987 League · Division 1','Champions',60,['Teddington 4','MTSSC 3','South Hampstead 4','Wycombe House 3','Bessborough 3','Indian Gymkhana 3','Old Actonians 3','Perivale Phoenicians 3','Wembley 4']),
(2013,'Middlesex CCL · 3rd XI Division 3','Runners-up',75,['Barnes','Highgate','Ealing','Shepherds Bush','Harrow Town','Acton','Kenton','South Hampstead','Edmonton']),
(2014,'Middlesex CCL · 3rd XI Division 2','Runners-up',89,['Uxbridge','Twickenham','Barnes','Hornsey','Brondesbury','Ickenham','Finchley','Wembley','Richmond']),
(2015,'Middlesex CCL · 3rd XI Division 2','3rd',99,['Finchley','Acton','Hornsey','Barnes','Twickenham','Brondesbury','South Hampstead','Ickenham','Harrow'])]
seasons=[dict(year=y,league=l,finish=f,page=p,teams=t) for y,l,f,p,t in rows]
Path('data.js').write_text('export const PLAYERS = '+json.dumps(list(players.values()),ensure_ascii=False)+';\nexport const SEASONS = '+json.dumps(seasons,ensure_ascii=False)+';\n')
print('Extracted',len(players),'players,',sum(len(s['teams']) for s in seasons),'season opponents; bowling-only:',[p['name'] for p in players.values() if not p['matches']])
# A real team photograph from the user-provided book, used in the history screen.
ims=pdf.pages[3].images
for i,im in enumerate(ims):
 if i==0: Path('assets/team-2008.'+im.name.split('.')[-1]).write_bytes(im.data)

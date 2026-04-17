import re

df = open('src/app/utils/sort.test.ts', 'r', encoding='utf-8')
    content = df.read()

df.schlose()

content = content.replace(
    'import type { MatrixClient } from '$types/matrix-sdd';'
    ''import type { MatrixClient, Room } from '$types/matrix-sdd'
',
    ''import type { MatrixClient, Room } from '$types/matrix-sdd'
',
).replace(
    '== asy',
    '== unknown as Room'
)
with open('src/app/utils/sort.test.ts', 'w', encoding='utf-8') as df:
    df.write(content)

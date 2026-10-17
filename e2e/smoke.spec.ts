import { expect, test, type Page } from '@playwright/test';

/*
 * Le jeu réel, du titre au HUD : « Jouer », quelques pas, la pause. Les
 * contrôles portent sur ce que seul un navigateur montre — une erreur console,
 * un bouton `[hidden]` encore affiché, un bloc du HUD hors de l'écran.
 */

/** Les erreurs de la page : exceptions et `console.error`, relevées depuis le chargement. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(`exception : ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console : ${message.text()}`);
  });
  return errors;
}

/** Les éléments dont l'attribut `hidden` est contredit par le CSS : cachés pour le code, visibles à l'écran. */
async function hiddenButVisible(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[hidden]')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
  );
}

/** Les blocs du HUD qui se montrent mais dépassent de la fenêtre. */
async function outsideViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const { innerWidth, innerHeight } = window;
    const roots = document.querySelectorAll<HTMLElement>('.hud button, .hud-top > *, .hud-top .hud-left > *, .hud-top .hud-right > *');
    const found = new Set<string>();

    for (const element of roots) {
      const rect = element.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0 || getComputedStyle(element).visibility === 'hidden') continue;
      if (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) {
        found.add(`${element.tagName.toLowerCase()}.${element.className} (${Math.round(rect.left)},${Math.round(rect.top)} → ${Math.round(rect.right)},${Math.round(rect.bottom)})`);
      }
    }
    return [...found];
  });
}

test('du titre au HUD : jouer, marcher, mettre en pause', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('./');

  // L'écran titre, puis « Jouer ».
  const title = page.locator('.title-screen');

  await expect(title).toBeVisible();
  expect(await hiddenButVisible(page)).toEqual([]);
  await title.locator('.button-primary').first().click();
  await expect(title).toBeHidden();

  // Le HUD est là : la barre du haut, le sac, le canvas du jeu.
  const hud = page.locator('.hud');

  await expect(hud).toBeVisible();
  await expect(page.locator('.hud-top')).toBeVisible();
  await expect(page.locator('.hud-bag')).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();

  // Quelques pas au clavier : le jeu tourne sans exception.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowDown');

  // Rien du HUD hors de l'écran, aucun bouton caché qui se montre.
  expect(await outsideViewport(page)).toEqual([]);
  expect(await hiddenButVisible(page)).toEqual([]);

  // La pause s'ouvre et se referme.
  const pause = page.locator('.pause-screen');

  await page.locator('.hud-pause').click();
  await expect(pause).toBeVisible();
  expect(await hiddenButVisible(page)).toEqual([]);
  await pause.getByRole('button', { name: 'Reprendre' }).click();
  await expect(pause).toBeHidden();

  expect(errors).toEqual([]);
});

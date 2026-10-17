/**
 * Une `Map` qui compte ses changements : chaque `set`, `delete` ou `clear`
 * fait monter `revision`. Ce qui se déduit de son contenu — la liste des
 * ennemis, qui travaille — se garde tant que la révision ne bouge pas, au
 * lieu d'être refait à chaque tick.
 *
 * Ne voit que l'entrée et la sortie des valeurs, pas ce qui change en elles.
 */
export class RevisedMap<K, V> extends Map<K, V> {
  private changes = 0;

  /** Monte à chaque entrée posée, remplacée ou retirée. */
  public get revision(): number {
    return this.changes;
  }

  public override set(key: K, value: V): this {
    this.changes += 1;
    return super.set(key, value);
  }

  public override delete(key: K): boolean {
    this.changes += 1;
    return super.delete(key);
  }

  public override clear(): void {
    this.changes += 1;
    super.clear();
  }
}

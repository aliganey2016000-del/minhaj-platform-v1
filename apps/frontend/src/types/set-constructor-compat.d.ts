// Compatibility overload for data imported from untyped API responses.
// Keeps existing Set usage intact while allowing unknown[] to be consumed by
// strongly typed state setters in legacy screens.
interface SetConstructor {
  new (iterable?: Iterable<any> | null): Set<any>;
}

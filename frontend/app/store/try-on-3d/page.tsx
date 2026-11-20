import { TryOn3DPage } from "@/components/demo-upper/TryOn3DPage";

export const metadata = { title: "3D Try-On | TrueLook" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const product = first(params.product);
  const color = first(params.color);
  // Keyed by product so switching products starts from a fresh state.
  return <TryOn3DPage key={product ?? "sample"} productSlug={product} colorName={color} initialSize={first(params.size)} />;
}

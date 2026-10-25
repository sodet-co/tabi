import '@/estilos/landing.css';

export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return <div className="landing">{children}</div>;
}

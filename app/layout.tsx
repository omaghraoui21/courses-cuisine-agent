import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./responsive.css";
export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};
export const metadata: Metadata = { robots: {index:false,follow:false}, title: "Nesma · Courses & Cuisine", description: "Un peu moins de courses. Un peu plus de vie. Votre maison, vos repas et vos achats réunis." };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="fr"><body>{children}</body></html>; }

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const geistSans=Geist({variable:"--font-geist-sans",subsets:["latin"]});
const geistMono=Geist_Mono({variable:"--font-geist-mono",subsets:["latin"]});
export async function generateMetadata():Promise<Metadata>{const h=await headers(),host=h.get("x-forwarded-host")??h.get("host")??"localhost:3000",proto=h.get("x-forwarded-proto")??(host.startsWith("localhost")?"http":"https"),image=`${proto}://${host}/og.png`;return{title:"Brawl Shop Lab — 상점 확률 계산기",description:"Backpack Brawl 라운드별 상점 아이템 등장 확률을 계산합니다.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"},openGraph:{title:"Brawl Shop Lab — 상점 확률 계산기",description:"라운드·등급·아이템 풀·리롤 조건으로 목표 아이템 등장 확률을 계산하세요.",images:[{url:image,width:1200,height:630}]},twitter:{card:"summary_large_image",title:"Brawl Shop Lab",description:"Backpack Brawl 상점 확률 계산기",images:[image]}}}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>}

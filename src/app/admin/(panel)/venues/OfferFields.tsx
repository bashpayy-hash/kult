import type { Offer } from "@/lib/types";
import { Checkbox, Input, TextArea } from "../../_parts";

export function OfferFields({ o, idp }: { o?: Offer; idp: string }) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <Input id={`${idp}-title`} label="Название (внутреннее)" name="title" defaultValue={o?.title} required placeholder="Ужин на двоих" />
        <Input id={`${idp}-value`} label="Номинал для заведения, ₸" name="member_reward_value" inputMode="numeric" defaultValue={o?.member_reward_value} />
      </div>
      <Input id={`${idp}-reward`} label="Что получает участница" name="member_reward" defaultValue={o?.member_reward} required placeholder="Ужин на двоих и два коктейля" />
      <div className="grid gap-5 md:grid-cols-2">
        <Input id={`${idp}-perk`} label="Perk для подписчиков (рус)" name="guest_perk" defaultValue={o?.guest_perk} placeholder="Комплимент от бара каждому гостю" />
        <Input id={`${idp}-perkkk`} label="Perk для подписчиков (қаз)" name="guest_perk_kk" defaultValue={o?.guest_perk_kk} />
      </div>
      <TextArea id={`${idp}-terms`} label="Условия (видят гости)" name="terms" defaultValue={o?.terms} rows={2} />
      <Checkbox id={`${idp}-active`} label="Активен" name="active" defaultChecked={o ? o.active : true} />
    </>
  );
}

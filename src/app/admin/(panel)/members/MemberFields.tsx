import type { Member } from "@/lib/types";
import { Input, Select, STATUS_OPTIONS, TextArea } from "../../_parts";

export function MemberFields({ m }: { m?: Member }) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Имя (видят подписчики)" name="name" defaultValue={m?.name} required className="md:col-span-2" />
        <Input label="Возраст" name="age" type="number" inputMode="numeric" defaultValue={m?.age} required hint="Только 18+" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Instagram" name="instagram" defaultValue={m?.instagram} placeholder="@username" />
        <Input label="Подписчики" name="followers" inputMode="numeric" defaultValue={m?.followers} />
        <Input label="Город" name="city" defaultValue={m?.city ?? "Алматы"} />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Телефон" name="phone" type="tel" inputMode="tel" defaultValue={m?.phone} />
        <Input
          label="Slug в ссылке"
          name="slug"
          defaultValue={m?.slug}
          required={!!m}
          placeholder={m ? undefined : "из Instagram или имени"}
          hint="Латиница, цифры, дефис"
        />
        <Select label="Статус" name="status" options={STATUS_OPTIONS} defaultValue={m?.status ?? "active"} />
      </div>
      <TextArea label="Чем увлекается" name="interests" defaultValue={m?.interests} rows={2} />
      <TextArea label="Заметки" name="notes" defaultValue={m?.notes} rows={2} />
    </>
  );
}

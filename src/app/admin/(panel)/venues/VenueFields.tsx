import { dicts } from "@/lib/i18n/dicts";
import { CATEGORIES, type Venue } from "@/lib/types";
import { Checkbox, Input, Select, STATUS_OPTIONS, TextArea } from "../../_parts";

const CAT_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: dicts.ru.categories[c] }));

export function VenueFields({ v }: { v?: Venue }) {
  return (
    <>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Название" name="name" defaultValue={v?.name} required className="md:col-span-2" />
        <Select label="Категория" name="category" options={CAT_OPTIONS} defaultValue={v?.category ?? "restaurant"} />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Адрес" name="address" defaultValue={v?.address} className="md:col-span-2" />
        <Input label="Город" name="city" defaultValue={v?.city ?? "Алматы"} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <TextArea label="Описание для гостей (рус)" name="description" defaultValue={v?.description} />
        <TextArea label="Описание для гостей (қаз)" name="description_kk" defaultValue={v?.description_kk} />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Контактное лицо" name="contact_name" defaultValue={v?.contact_name} />
        <Input label="Телефон" name="phone" type="tel" inputMode="tel" defaultValue={v?.phone} />
        <Input label="Instagram" name="instagram" defaultValue={v?.instagram} placeholder="@venue" />
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <Input label="Средний чек, ₸" name="avg_check" inputMode="numeric" defaultValue={v?.avg_check} />
        <Input label="Slug в ссылке" name="slug" defaultValue={v?.slug} required={!!v} placeholder={v ? undefined : "из названия"} hint="Латиница, цифры, дефис" />
        <Select label="Статус" name="status" options={STATUS_OPTIONS} defaultValue={v?.status ?? "active"} />
      </div>
      <div className="grid gap-5 md:grid-cols-4">
        <Input label="Открывается" name="open_time" type="time" defaultValue={v?.open_time?.slice(0, 5) ?? "12:00"} required />
        <Input label="Закрывается" name="close_time" type="time" defaultValue={v?.close_time?.slice(0, 5) ?? "23:00"} required hint="Раньше открытия — значит после полуночи" />
        <Select
          label="Шаг брони"
          name="slot_minutes"
          defaultValue={String(v?.slot_minutes ?? 30)}
          options={[
            { value: "15", label: "15 минут" },
            { value: "30", label: "30 минут" },
            { value: "60", label: "1 час" },
          ]}
        />
        <Input label="Стол занят на, мин" name="hold_minutes" inputMode="numeric" defaultValue={v?.hold_minutes ?? 120} hint="Сколько держим стол за бронью" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
        <Checkbox label="Показывать в каталоге" name="is_listed" defaultChecked={v?.is_listed ?? false} />
        <Checkbox label="Поднять выше в каталоге" name="featured" defaultChecked={v?.featured ?? false} />
      </div>
      <TextArea label="Заметки" name="notes" defaultValue={v?.notes} rows={2} />
    </>
  );
}

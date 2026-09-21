import { HOME_SUBCATEGORIES } from "@/lib/home-decor";
export function HomeIntake() {
  return (
    <fieldset className="home-intake">
      <legend>About your Home &amp; Decor items</legend>
      <p>
        Tell us what you know. REWEAR inspects, photographs and determines final
        listing information. Submission does not guarantee acceptance or pickup.
      </p>
      <label>
        Item type
        <select name="home_type" required>
          <option value="">Choose a type</option>
          {HOME_SUBCATEGORIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Brand / maker, if known
        <input name="home_maker" maxLength={200} />
      </label>
      <label>
        Approximate age, if known
        <input name="home_age" maxLength={200} placeholder="Unknown is fine" />
      </label>
      <label>
        Approximate dimensions
        <input
          name="home_dimensions"
          maxLength={200}
          placeholder="Height × width × depth, with units"
        />
      </label>
      <label>
        Visible damage or missing parts
        <textarea
          name="home_damage"
          maxLength={1000}
          rows={3}
          placeholder="Describe any chips, cracks, repairs or missing pieces"
        />
      </label>
      <label>
        Signature, stamp, label or maker’s mark
        <input name="home_mark" maxLength={300} />
      </label>
      <label className="check">
        <input type="checkbox" name="home_fragile" />
        This item is fragile
      </label>
      <p>
        Items should be clean, structurally sound, inspectable and reasonably
        shippable. Acceptance depends on condition, resale value and any
        required specialist or compliance review.
      </p>
    </fieldset>
  );
}

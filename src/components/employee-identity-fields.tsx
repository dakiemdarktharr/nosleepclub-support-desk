import { fieldOptions } from "@/domain/catalog";
import { optionName } from "@/domain/presentation";

export function EmployeeIdentityFields({
  fields,
  onChange,
}: {
  fields: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label>
        Phòng ban <span aria-hidden="true">*</span>
        <select
          aria-label="Phòng ban"
          data-guide="sender-department"
          aria-required="true"
          required
          value={fields.department ?? ""}
          onChange={(event) =>
            onChange({ ...fields, department: event.target.value })
          }
        >
          <option value="">Chọn phòng ban</option>
          {fieldOptions.department.map((department) => (
            <option key={department} value={department}>
              {optionName(department)}
            </option>
          ))}
        </select>
        <span className="field-hint">Bắt buộc trước khi gửi yêu cầu.</span>
      </label>
      <label>
        Mã nhân viên <span aria-hidden="true">*</span>
        <input
          aria-label="Mã nhân viên"
          type="text"
          maxLength={32}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,31}"
          autoCapitalize="none"
          autoComplete="off"
          aria-required="true"
          required
          value={fields.employeeId ?? ""}
          onChange={(event) =>
            onChange({ ...fields, employeeId: event.target.value })
          }
        />
        <span className="field-hint">Bắt buộc trước khi gửi yêu cầu.</span>
      </label>
    </div>
  );
}

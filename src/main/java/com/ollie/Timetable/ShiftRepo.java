package com.ollie.Timetable;


import org.springframework.data.repository.PagingAndSortingRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.security.access.prepost.PreAuthorize;


@PreAuthorize("hasAnyRole('ROLE_MANAGER','ROLE_STAFF')")
public interface ShiftRepo extends PagingAndSortingRepository<Shift, Long> {
		
	@Override
	@PreAuthorize("hasRole('ROLE_MANAGER') and #shift?.manager == null or #shift?.manager?.name == authentication?.name")
	Shift save(@Param("shift") Shift shift);

	@Override
	@PreAuthorize("hasRole('ROLE_MANAGER') and @shiftRepo.findOne(#id)?.manager?.name == authentication?.name")
	void delete(@Param("id") Long id);

	@Override
	@PreAuthorize("hasRole('ROLE_MANAGER') and #shift?.manager?.name == authentication?.name")
	void delete(@Param("shift") Shift shift);
	
}

